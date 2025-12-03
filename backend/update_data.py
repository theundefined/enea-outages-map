from __future__ import annotations

import json
import re
import time
from datetime import datetime, timezone
from pathlib import Path

from enea_outages.client import EneaOutagesClient
from enea_outages.models import Outage, OutageType
from geopy.exc import GeocoderTimedOut
from geopy.geocoders import Nominatim
from geopy.extra.rate_limiter import RateLimiter

# --- CONFIGURATION ---
REGION = "Poznań"
OUTPUT_FILE = Path("frontend/outages.json")
CACHE_FILE = Path("backend/geocoding_cache.json")

# Nominatim requires a user-agent
geolocator = Nominatim(user_agent="enea_outages_map_project/1.0")
# Adhere to Nominatim's usage policy (1 request per second)
geocode = RateLimiter(geolocator.geocode, min_delay_seconds=1, error_wait_seconds=10)


def load_cache() -> dict:
    """Loads the geocoding cache from a file."""
    if CACHE_FILE.exists():
        print("Loading geocoding cache...")
        with open(CACHE_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_cache(cache: dict):
    """Saves the geocoding cache to a file."""
    print("Saving geocoding cache...")
    with open(CACHE_FILE, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, indent=2)


def parse_addresses_from_description(description: str) -> list[str]:
    """
    Parses a complex description string to extract individual street addresses.
    """
    desc = description.lower()
    desc = re.sub(r'\(.*\)', '', desc)
    desc = re.sub(r'w godz\..*', '', desc)
    
    parts = re.split(r',|\s+i\s+|\s+oraz\s+', desc)
    
    addresses = []
    for part in parts:
        part = part.strip()
        
        # Handle "ul. XYZ" or "os. ABC"
        match = re.search(r'(?:ul\.|os\.|al\.)\s*([\w\s\-\.]+\w)', part)
        if match:
            street_name = match.group(1).strip()
            street_name = re.sub(r'\s+od\s+\d+.*', '', street_name).strip()
            street_name = re.sub(r'\s+do\s+\d+.*', '', street_name).strip()
            street_name = re.sub(r'\s+\d+.*', '', street_name).strip()
            if len(street_name) > 2:
                addresses.append(street_name)
            continue

        # Handle "Poznań ulica XYZ"
        if 'poznań' in part:
            address_part = part.replace('poznań', '').replace('ulica', '').strip()
            if len(address_part) > 2:
                addresses.append(address_part)

    return list(set(a for a in addresses if a))


def get_all_outages(client: EneaOutagesClient, cache: dict) -> tuple[list[dict], list[dict]]:
    """
    Fetches all planned and unplanned outages, geocodes them,
    and returns lists of processed outages.
    """
    processed_planned: list[dict] = []
    processed_unplanned: list[dict] = []

    for outage_type in [OutageType.PLANNED, OutageType.UNPLANNED]:
        print(f"\n--- Fetching {outage_type.name} outages for region: {REGION} ---")
        try:
            outages = client.get_outages_for_region(region=REGION, outage_type=outage_type)
        except Exception as e:
            print(f"Error fetching {outage_type.name} outages: {e}")
            continue

        print(f"Found {len(outages)} {outage_type.name} outage reports.")

        for outage in outages:
            # We are only interested in reports that mention Poznań
            if "poznań" not in outage.description.lower() and "miejscowość poznań" not in outage.description.lower():
                continue

            addresses = parse_addresses_from_description(outage.description)
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
                    except GeocoderTimedOut:
                        print(f"    - Geocoding timed out for: {full_address_query}")
                    except Exception as e:
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

                if outage_type == OutageType.PLANNED:
                    processed_planned.append(outage_item)
                else:
                    processed_unplanned.append(outage_item)

    print(f"\nSuccessfully processed {len(processed_planned)} planned and {len(processed_unplanned)} unplanned locations.")
    return processed_planned, processed_unplanned


def main():
    """Main function to update the outage data."""
    geocoding_cache = load_cache()
    client = EneaOutagesClient()
    
    planned, unplanned = get_all_outages(client, geocoding_cache)
    
    # Sort the lists to ensure deterministic output
    planned.sort(key=lambda x: (x['start_time'], x['end_time'], x['geocoded_address']))
    unplanned.sort(key=lambda x: (x['start_time'], x['end_time'], x['geocoded_address']))
    
    final_data = {
        "planned": planned,
        "unplanned": unplanned,
        "last_update": datetime.now(timezone.utc).isoformat()
    }

    print(f"\nSaving data to {OUTPUT_FILE}...")
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(final_data, f, ensure_ascii=False, indent=2)
    
    save_cache(geocoding_cache)
    print("Done.")


if __name__ == "__main__":
    main()
