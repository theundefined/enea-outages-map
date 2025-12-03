# Enea Outages Map

An automatically updated map of Enea power outages for the city of Poznań.

This project displays current and planned power outages on an interactive map. The data is fetched automatically every 10 minutes using a GitHub Actions workflow.

The map can be viewed here: [https://theundefined.github.io/enea-outages-map/frontend/](https://theundefined.github.io/enea-outages-map/frontend/)

*(Note: The link will be active after deploying the project to a GitHub repository named `enea-outages-map` under the `TheUndefined` account and enabling GitHub Pages.)*

![Screenshot of the map](./screenshot.png) *(TODO: Add a screenshot after deployment)*

---

> This project was created with the assistance of Google's Gemini AI.

## How It Works

*   A **GitHub Actions** workflow runs every 10 minutes.
*   It executes a **Python script** (`backend/update_data.py`) which:
    1.  Fetches current and planned outages using the `enea-outages` library.
    2.  Parses the descriptions to find addresses in Poznań.
    3.  Uses `geopy` to convert addresses to coordinates, leveraging a file-based cache (`backend/geocoding_cache.json`) to minimize API calls.
    4.  Saves the final data into `frontend/outages.json`.
*   The workflow commits the updated `outages.json` and `geocoding_cache.json` files to the repository.
*   The **frontend** is a static HTML page with JavaScript and [Leaflet.js](https://leafletjs.com/) that reads the JSON data and displays it on an [OpenStreetMap](https://www.openstreetmap.org/) tile layer.

## Local Development

To run the project locally:

1.  **Set up the backend:**
    ```bash
    # Create a virtual environment
    python3 -m venv backend/venv

    # Install dependencies
    backend/venv/bin/pip install -r backend/requirements.txt
    ```

2.  **Generate the data:**
    ```bash
    # Run the script to generate frontend/outages.json
    backend/venv/bin/python backend/update_data.py
    ```

3.  **View the frontend:**
    ```bash
    # Navigate to the frontend directory
    cd frontend

    # Start a local web server
    python3 -m http.server 8000
    ```
    Then, open your web browser and go to `http://localhost:8000`.
