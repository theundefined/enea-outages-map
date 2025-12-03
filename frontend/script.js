document.addEventListener('DOMContentLoaded', () => {
    const map = L.map('map').setView([52.4064, 16.9252], 12);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    const unplannedLayer = L.layerGroup().addTo(map);
    const ongoingPlannedLayer = L.layerGroup().addTo(map);
    const next24hPlannedLayer = L.layerGroup();
    const otherPlannedLayer = L.layerGroup();

    const icons = {
        unplanned: new L.Icon({
            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
            iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
        }),
        ongoing: new L.Icon({
            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-orange.png',
            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
            iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
        }),
        next24h: new L.Icon({
            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-yellow.png',
            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
            iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
        }),
        other: new L.Icon({
            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-grey.png',
            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
            iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
        })
    };

    function processOutages(outages) {
        // Clear previous markers
        unplannedLayer.clearLayers();
        ongoingPlannedLayer.clearLayers();
        next24hPlannedLayer.clearLayers();
        otherPlannedLayer.clearLayers();

        const now = new Date();
        const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        
        const allOutages = outages.filter(o => o.type === 'planned' || o.type === 'unplanned');

        allOutages.forEach(outage => {
            let targetLayer, icon, status, popupContent;

            if (outage.type === 'unplanned') {
                targetLayer = unplannedLayer;
                icon = icons.unplanned;
                status = 'Nieplanowana przerwa';
                 popupContent = `<b>${status}</b><br>
                    <strong>Adres:</strong> ${outage.geocoded_address}<br>
                    <strong>Koniec (przewidywany):</strong> ${new Date(outage.end_time).toLocaleString('pl-PL')}<br>
                    <strong>Opis:</strong> ${outage.original_description}`;
            } else { // Planned
                const startTime = new Date(outage.start_time);
                const endTime = new Date(outage.end_time);

                if (now >= startTime && now <= endTime) {
                    targetLayer = ongoingPlannedLayer;
                    icon = icons.ongoing;
                    status = 'Planowana (trwająca)';
                } else if (startTime > now && startTime <= in24h) {
                    targetLayer = next24hPlannedLayer;
                    icon = icons.next24h;
                    status = 'Planowana (w ciągu 24h)';
                } else {
                    targetLayer = otherPlannedLayer;
                    icon = icons.other;
                    status = (now > endTime) ? 'Planowana (zakończona)' : 'Planowana (przyszła)';
                }
                 popupContent = `<b>${status}</b><br>
                    <strong>Adres:</strong> ${outage.geocoded_address}<br>
                    <strong>Początek:</strong> ${startTime.toLocaleString('pl-PL')}<br>
                    <strong>Koniec:</strong> ${endTime.toLocaleString('pl-PL')}<br>
                    <strong>Opis:</strong> ${outage.original_description}`;
            }

            const marker = L.marker([outage.lat, outage.lon], { icon: icon })
                .addTo(targetLayer)
                .bindPopup(popupContent);
            
            marker.on('mouseover', function (e) { this.openPopup(); });
            marker.on('mouseout', function (e) { this.closePopup(); });
        });
    }

    // --- Initial Load ---
    fetch('data/master_index.json')
        .then(response => response.ok ? response.json() : Promise.reject('Index not found'))
        .then(index => {
            if (index.length === 0) {
                return Promise.reject('Index is empty');
            }
            const latestDate = index[0]; // Assumes index is sorted newest first
            return fetch(`data/outages_${latestDate}.json`);
        })
        .then(response => response.ok ? response.json() : Promise.reject('Data file not found'))
        .then(data => {
            processOutages(data);

            const overlayMaps = {
                "Nieplanowane": unplannedLayer,
                "Planowane (trwające)": ongoingPlannedLayer,
                "Planowane (w ciągu 24h)": next24hPlannedLayer,
                "Planowane (inne)": otherPlannedLayer
            };
            L.control.layers(null, overlayMaps).addTo(map);

            // TODO: Add UI for date selection and wire it up to load other files
        })
        .catch(error => {
            console.error('Error loading initial data:', error);
            // Display an error message on the map
        });
        
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