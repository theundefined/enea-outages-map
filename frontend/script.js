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

    const dateSelector = document.getElementById('date-selector');
    const infoControl = L.control();

    infoControl.onAdd = function (map) {
        this._div = L.DomUtil.create('div', 'info');
        this.update('Wybierz widok z listy.');
        return this._div;
    };
    infoControl.update = function (mainText, lastUpdate = 'N/A') {
        const updateTimeText = lastUpdate !== 'N/A' ? `<br>Ostatnia aktualizacja danych: ${new Date(lastUpdate).toLocaleString('pl-PL')}` : '';
        this._div.innerHTML = `<h4>Informacje</h4>${mainText}${updateTimeText}`;
    };
    infoControl.addTo(map);

    function clearAllLayers() {
        unplannedLayer.clearLayers();
        ongoingPlannedLayer.clearLayers();
        next24hPlannedLayer.clearLayers();
        otherPlannedLayer.clearLayers();
    }

    function renderOutages(outages, referenceDate) {
        clearAllLayers();
        
        const now = referenceDate;
        const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

        if (!outages || outages.length === 0) {
            return; // No outages to render
        }

        outages.forEach(outage => {
            let targetLayer, icon, status, popupContent;

            if (outage.type === 'unplanned') {
                if (outage.end_time === "Brak danych") return; // Cannot determine end time
                const endTime = new Date(outage.end_time);
                if (endTime < now) return; 
                
                targetLayer = unplannedLayer;
                icon = icons.unplanned;
                status = 'Nieplanowana przerwa';
                 popupContent = `<b>${status}</b><br>
                    <strong>Adres:</strong> ${outage.geocoded_address}<br>
                    <strong>Koniec (przewidywany):</strong> ${new Date(outage.end_time).toLocaleString('pl-PL')}<br>
                    <strong>Opis:</strong> ${outage.original_description}`;
            } else { // Planned
                if (outage.start_time === "Brak danych" || outage.end_time === "Brak danych") return;
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

    const overlayMaps = {
        "Nieplanowane": unplannedLayer,
        "Planowane (trwające)": ongoingPlannedLayer,
        "Planowane (w ciągu 24h)": next24hPlannedLayer,
        "Planowane (inne)": otherPlannedLayer
    };
    L.control.layers(null, overlayMaps).addTo(map);

    let masterIndex = [];
    let allDataCache = {}; 

    async function loadDataForSelection(selectedValue) {
        let dataPayload = {};
        let referenceDate;
        let dateToFetch;
        let mainInfoText;

        if (selectedValue === 'current') {
            referenceDate = new Date();
            dateToFetch = masterIndex[0]; 
            mainInfoText = 'Widok bieżący';
        } else {
            referenceDate = new Date(selectedValue);
            referenceDate.setHours(12, 0, 0, 0); 
            dateToFetch = selectedValue;
            mainInfoText = `Dane dla: ${selectedValue}`;
        }

        if (!dateToFetch) {
            infoControl.update('Brak dostępnych danych do załadowania.');
            clearAllLayers();
            return;
        }

        infoControl.update(mainInfoText, 'Ładowanie...');
        
        if (allDataCache[dateToFetch]) {
            console.log(`Loading ${dateToFetch} from cache...`);
            dataPayload = allDataCache[dateToFetch];
        } else {
            console.log(`Fetching data for ${dateToFetch}...`);
            const response = await fetch(`data/outages_${dateToFetch}.json`);
            if (!response.ok) {
                infoControl.update(`Błąd ładowania danych dla ${dateToFetch}`);
                clearAllLayers();
                return;
            }
            dataPayload = await response.json();
            allDataCache[dateToFetch] = dataPayload;
        }
        
        renderOutages(dataPayload.outages || [], referenceDate);
        infoControl.update(mainInfoText, dataPayload.last_update);
    }

    fetch('data/master_index.json')
        .then(response => response.ok ? response.json() : Promise.reject('Index not found'))
        .then(index => {
            masterIndex = index;
            if (masterIndex.length > 0) {
                const currentOption = document.createElement('option');
                currentOption.value = "current";
                currentOption.textContent = "Aktualne";
                dateSelector.appendChild(currentOption);

                masterIndex.forEach(dateStr => {
                    const option = document.createElement('option');
                    option.value = dateStr;
                    option.textContent = dateStr;
                    dateSelector.appendChild(option);
                });
                
                dateSelector.value = 'current';
                loadDataForSelection('current');
            } else {
                infoControl.update('Brak dostępnych danych historycznych.');
            }
        })
        .catch(error => {
            console.error('Error loading master index:', error);
            infoControl.update('Błąd ładowania indeksu danych historycznych.');
        });
    
    dateSelector.addEventListener('change', (event) => {
        loadDataForSelection(event.target.value);
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