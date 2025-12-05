#!/bin/bash
echo "Starting local web server for Enea Outages Map..."
echo "Access it at http://localhost:8000"
echo "Press Ctrl+C to stop the server."
cd docs && python3 -m http.server
