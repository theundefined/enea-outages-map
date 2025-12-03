# Enea Outages Map

This project is a static website that displays current power outages from Enea for the city of Poznań on an interactive map.

## Project Overview

The project consists of two main parts:

1.  **Data Fetching Script:** A Python script (`backend/update_data.py`) that runs on a schedule using GitHub Actions. It fetches the latest power outage data from the `enea-outages` library and saves it as a static `frontend/outages.json` file.

2.  **Static Frontend:** A simple HTML/CSS/JavaScript application (`frontend/`) that displays the outage data on a map. It uses Leaflet.js for the map and OpenStreetMap as the map provider. The frontend fetches the `frontend/outages.json` file to get the outage locations.

## How it Works

1.  A GitHub Actions workflow (defined in `.github/workflows/update_outages.yml`) runs every 10 minutes.
2.  The workflow runs the `backend/update_data.py` script.
3.  The script fetches outage data and if there are any changes, it commits the updated `frontend/outages.json` file to the repository.
4.  The website is hosted using GitHub Pages. Any changes pushed to the main branch (including the updated `outages.json` file) are automatically deployed.

## Development

To work on this project locally:

1.  You need Python installed.
2.  Install the required Python libraries: `pip install -r backend/requirements.txt` (Note: `requirements.txt` will be created later).
3.  Run the Python script to generate the `outages.json` file: `python backend/update_data.py`.
4.  Open `frontend/index.html` in your web browser.
