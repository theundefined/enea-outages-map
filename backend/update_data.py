from __future__ import annotations

import json
import re
import time
from datetime import datetime, timezone
from pathlib import Path
import hashlib

from enea_outages.client import EneaOutagesClient
from enea_outages.models import Outage, OutageType
from geopy.exc import GeocoderTimedOut
from geopy.geocoders import Nominatim
from geopy.extra.rate_limiter import RateLimiter

# --- CONFIGURATION ---
REGION = "Poznań"
DATA_DIR = Path("docs/data")
CACHE_FILE = Path("backend/geocoding_cache.json")

# Nominatim requires a user-agent
geolocator = Nominatim(user_agent="enea_outages_map_project/1.0")
# Adhere to Nominatim's usage policy (1 request per second)
geocode = RateLimiter(geolocator.geocode, min_delay_seconds=1, error_wait_seconds=10)


def load_json_file(file_path: Path) -> dict | list:
    """
    Loads a JSON file if it exists. Handles both old (list) and new (dict) formats.
    """
    if file_path.exists():
        print(f"Loading existing data from {file_path}...")
        with open(file_path, "r", encoding="utf-8") as f:
            try:
                data = json.load(f)
                # Handle backward compatibility: if we load an old file that is a list
                if isinstance(data, list) and "outages" in file_path.name:
                     print("Found old format (list), converting to new format (dict).")
                     return {"last_update": "", "outages": data}
                return data
            except json.JSONDecodeError:
                pass  # Return default if file is corrupted
    
    # Return default structure based on file type
    if "master_index" in file_path.name:
        return []
    return {"last_update": "", "outages": []}


def save_json_file(data: dict | list, file_path: Path):
    """Saves data to a JSON file."""
    print(f"Saving data to {file_path}...")
    file_path.parent.mkdir(parents=True, exist_ok=True)
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def generate_outage_id(outage_item: dict) -> str:
    """Creates a unique ID for an outage to prevent duplicates."""
    unique_string = f"{outage_item['start_time']}-{outage_item['end_time']}-{outage_item['original_description']}-{outage_item['geocoded_address']}"
    return hashlib.md5(unique_string.encode()).hexdigest()

UPPER = "A-ZĄĆĘŁŃÓŚŹŻ"
LOWER = "a-ząćęłńóśźż"
LOCALITY_NAME = rf"[{UPPER}][{LOWER}{UPPER}\-]*(?: [{UPPER}][{LOWER}{UPPER}\-]*)*"
# A locality header names a town followed by ":" or by its first street ("Poznań: ul. ...",
# "Luboń ul. ...", "Gmina X miejscowość Y ul. ...", "Miasto Poznań ul. ..."). It may only start
# the text or follow a separator / locality keyword, so street names like "ul. Armii Poznań"
# or "ul. Poznańska" are never mistaken for headers.
STREET_PREFIX = r"(?:(?:ul|os|pl|al)\.|ulic[ae]\b|osiedle\b|plac\b|rynek\b|park\b)"
LOCALITY_HEADER = re.compile(
    # The start of the text is always a locality, whatever follows it ("Poznań rynek Jeżycki").
    rf"^\s*(?P<first>{LOCALITY_NAME})"
    rf"|(?:(?<=[\n/,.:])|(?<=miejscowość )|(?<=miejscowości )|(?<=Miasto ))\s*"
    rf"(?P<name>{LOCALITY_NAME})(?=\s*:|\s+{STREET_PREFIX})"
)


def extract_poznan_segment(description: str) -> str:
    """
    Returns the parts of a description that list streets in Poznań, or "" if there are none.
    Enea descriptions often cover several localities; streets of neighbouring towns
    (e.g. "Kiekrz: ul. Poznańska") must not be geocoded as Poznań streets.
    """
    headers = list(LOCALITY_HEADER.finditer(description))
    segments = []
    for i, header in enumerate(headers):
        name = header.group("first") or header.group("name")
        if name.startswith("Miasto "):
            name = name[len("Miasto "):]
        if name != "Poznań":
            continue
        end = headers[i + 1].start() if i + 1 < len(headers) else len(description)
        segments.append(description[header.end():end])
    return " , ".join(segments)


# Prefixes that are part of the geocodable name (a square or park is not a street).
KEPT_PREFIXES = {"pl.": "plac", "plac": "plac", "rynek": "rynek", "park": "park", "osiedle": "osiedle"}


def parse_addresses_from_description(description: str) -> list[str]:
    """
    Parses a complex description string to extract individual street addresses.
    """
    desc = description.lower()
    desc = re.sub(r'\(.*\)', '', desc)
    desc = re.sub(r'w godz\..*', '', desc)
    
    parts = re.split(r',|\n|\s+i\s+|\s+oraz\s+', desc)
    
    addresses = []
    for part in parts:
        part = part.strip()
        # "Poznań: Lelewela 56, ..." (as cut by extract_poznan_segment) names a street without a prefix.
        bare_street = part.startswith(':')
        part = part.lstrip(':').strip()

        match = re.search(r'(ul\.|os\.|al\.|pl\.|\b(?:ulica|plac|rynek|park|osiedle)\b)\s*([\w\s\-\.]+\w)', part)
        if not match and bare_street:
            match = re.match(r'()([\w\s\-\.]+\w)', part)
        if match:
            street_name = match.group(2).strip()
            street_name = re.sub(r'\s+od\s+\d+.*', '', street_name).strip()
            street_name = re.sub(r'\s+do\s+\d+.*', '', street_name).strip()
            street_name = re.sub(r'\s+\d+.*', '', street_name).strip()
            if len(street_name) > 2:
                addresses.append(f"{KEPT_PREFIXES[match.group(1)]} {street_name}" if match.group(1) in KEPT_PREFIXES else street_name)
            continue

        if 'poznań' in part:
            address_part = part.replace('poznań', '').replace('ulica', '').strip()
            if len(address_part) > 2:
                addresses.append(address_part)

    return list(set(a for a in addresses if a))


def get_all_outages(client: EneaOutagesClient, cache: dict) -> list[dict]:
    """
    Fetches all planned and unplanned outages, geocodes them,
    and returns a list of processed outage dictionaries.
    """
    processed_outages: list[dict] = []

    for outage_type in [OutageType.PLANNED, OutageType.UNPLANNED]:
        print(f"\n--- Fetching {outage_type.name} outages for region: {REGION} ---")
        try:
            outages = client.get_outages_for_department(department=REGION, outage_type=outage_type)
        except Exception as e:
            print(f"Error fetching {outage_type.name} outages: {e}")
            continue

        print(f"Found {len(outages)} {outage_type.name} outage reports.")

        for outage in outages:
            poznan_segment = extract_poznan_segment(outage.description)
            if not poznan_segment:
                continue

            addresses = parse_addresses_from_description(poznan_segment)
            print(f"-> Found {len(addresses)} potential addresses in: \"{outage.description[:70]}...\"")

            for address in addresses:
                if not address: continue
                full_address_query = f"{address}, Poznań"
                location_data = None
                
                if full_address_query in cache:
                    print(f"  - Found in cache: {full_address_query}")
                    location_data = cache[full_address_query]
                else:
                    print(f"  - Geocoding: {full_address_query}")
                    try:
                        location = geocode(full_address_query, addressdetails=True, language="pl")
                        if location and "poznań" in location.address.lower():
                            print(f"    - Success: {location.address}")
                            location_data = {
                                "address": location.address,
                                "lat": location.latitude,
                                "lon": location.longitude,
                            }
                            cache[full_address_query] = location_data
                        else:
                            print(f"    - Could not geocode or address not in Poznań: {full_address_query}")
                            cache[full_address_query] = None
                    except (GeocoderTimedOut, Exception) as e:
                        print(f"    - Error during geocoding: {e}")
                
                if not location_data:
                    continue

                outage_item = {
                    "type": outage_type.name.lower(),
                    "geocoded_address": location_data["address"],
                    "lat": location_data["lat"],
                    "lon": location_data["lon"],
                    "start_time": outage.start_time.isoformat() if outage.start_time else "Brak danych",
                    "end_time": outage.end_time.isoformat() if outage.end_time else "Brak danych",
                    "original_description": outage.description,
                }
                outage_item["id"] = generate_outage_id(outage_item)
                processed_outages.append(outage_item)
    
    return processed_outages


def main():
    """Main function to update the outage data."""
    geocoding_cache = load_json_file(CACHE_FILE)
    if not isinstance(geocoding_cache, dict): geocoding_cache = {} # Ensure cache is a dict
    
    client = EneaOutagesClient()

    new_outages = get_all_outages(client, geocoding_cache)
    if not new_outages:
        print("No new outages to process. Exiting.")
        return

    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    today_file = DATA_DIR / f"outages_{today_str}.json"
    
    today_data = load_json_file(today_file)
    existing_outages = today_data.get("outages", [])
    existing_ids = {o['id'] for o in existing_outages}

    merged_outages = existing_outages
    for new_outage in new_outages:
        if new_outage['id'] not in existing_ids:
            merged_outages.append(new_outage)
            existing_ids.add(new_outage['id'])
    
    merged_outages.sort(key=lambda x: (x['start_time'], x['end_time'], x['geocoded_address']))
    
    final_today_data = {
        "last_update": datetime.now(timezone.utc).isoformat(),
        "outages": merged_outages
    }
    save_json_file(final_today_data, today_file)

    master_index_file = DATA_DIR / "master_index.json"
    master_index = load_json_file(master_index_file)
    if not isinstance(master_index, list): master_index = [] # Ensure index is a list
    
    if today_str not in master_index:
        master_index.append(today_str)
        master_index.sort(reverse=True)
        save_json_file(master_index, master_index_file)

    save_json_file(geocoding_cache, CACHE_FILE)
    print("Done.")


if __name__ == "__main__":
    main()
