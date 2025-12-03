document.addEventListener('DOMContentLoaded', () => {
    // Initialize the map and set its view to Poznań's coordinates
    const map = L.map('map').setView([52.4064, 16.9252], 12);

    // Add a tile layer from OpenStreetMap
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    // --- Layer Groups ---
    const unplannedLayer = L.layerGroup().addTo(map);
    const ongoingPlannedLayer = L.layerGroup().addTo(map);
    const futurePastPlannedLayer = L.layerGroup().addTo(map);
    
    // --- Custom Icons ---
    const unplannedIcon = new L.Icon({
        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
        iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
    });
    const ongoingPlannedIcon = new L.Icon({
        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-orange.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
        iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
    });
    const futurePlannedIcon = new L.Icon({
        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-grey.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
        iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
    });

    // --- Data Fetching and Processing ---
    fetch('outages.json')
        .then(response => response.ok ? response.text() : Promise.reject('Network response was not ok'))
        .then(text => text ? JSON.parse(text) : { planned: [], unplanned: [], last_update: 'N/A' })
        .then(data => {
            const now = new Date();

            // Process unplanned outages
            data.unplanned.forEach(outage => {
                const popupContent = `
                    <b>Nieplanowana przerwa</b><br>
                    <strong>Adres:</strong> ${outage.geocoded_address}<br>
                    <strong>Koniec (przewidywany):</strong> ${new Date(outage.end_time).toLocaleString('pl-PL')}<br>
                    <strong>Opis:</strong> ${outage.original_description}`;
                
                const marker = L.marker([outage.lat, outage.lon], { icon: unplannedIcon })
                    .addTo(unplannedLayer)
                    .bindPopup(popupContent);
                
                marker.on('mouseover', function (e) { this.openPopup(); });
                marker.on('mouseout', function (e) { this.closePopup(); });
            });

            // Process planned outages
            data.planned.forEach(outage => {
                const startTime = new Date(outage.start_time);
                const endTime = new Date(outage.end_time);
                let targetLayer;
                let icon;
                let status;

                if (now >= startTime && now <= endTime) {
                    targetLayer = ongoingPlannedLayer;
                    icon = ongoingPlannedIcon;
                    status = 'Planowana (trwająca)';
                } else {
                    targetLayer = futurePastPlannedLayer;
                    icon = futurePlannedIcon;
                    status = (now > endTime) ? 'Planowana (zakończona)' : 'Planowana (przyszła)';
                }

                const popupContent = `
                    <b>${status}</b><br>
                    <strong>Adres:</strong> ${outage.geocoded_address}<br>
                    <strong>Początek:</strong> ${startTime.toLocaleString('pl-PL')}<br>
                    <strong>Koniec:</strong> ${endTime.toLocaleString('pl-PL')}<br>
                    <strong>Opis:</strong> ${outage.original_description}`;

                const marker = L.marker([outage.lat, outage.lon], { icon: icon })
                    .addTo(targetLayer)
                    .bindPopup(popupContent);
                
                marker.on('mouseover', function (e) { this.openPopup(); });
                marker.on('mouseout', function (e) { this.closePopup(); });
            });

            // --- Layer Control ---
            const overlayMaps = {
                "Nieplanowane": unplannedLayer,
                "Planowane (trwające)": ongoingPlannedLayer,
                "Planowane (inne)": futurePastPlannedLayer
            };
            L.control.layers(null, overlayMaps).addTo(map);

            // --- Info Box ---
            const info = L.control();
            info.onAdd = function (map) {
                this._div = L.DomUtil.create('div', 'info');
                this.update(data.last_update);
                return this._div;
            };
            info.update = function (lastUpdate) {
                const updateTime = lastUpdate !== 'N/A' ? new Date(lastUpdate).toLocaleString('pl-PL') : 'Brak danych';
                this._div.innerHTML = '<h4>Informacje</h4>' + `Ostatnia aktualizacja: ${updateTime} (UTC)`;
            };
            info.addTo(map);

        })
        .catch(error => {
            console.error('Error fetching or parsing outage data:', error);
            const info = L.control();
            info.onAdd = function (map) {
                this._div = L.DomUtil.create('div', 'info');
                this._div.innerHTML = '<h4>Błąd</h4>Nie udało się załadować danych o awariach.';
                return this._div;
            };
            info.addTo(map);
        });
    
    // --- Static Styles ---
    const style = document.createElement('style');
    style.innerHTML = `
        .info {
            padding: 6px 8px;
            font: 14px/16px Arial, Helvetica, sans-serif;
            background: white;
            background: rgba(255,255,255,0.8);
            box-shadow: 0 0 15px rgba(0,0,0,0.2);
            border-radius: 5px;
        }
        .info h4 {
            margin: 0 0 5px;
            color: #777;
        }
    `;
    document.head.appendChild(style);
});