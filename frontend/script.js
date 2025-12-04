function categorizeOutage(outage, now, isCurrentView) {
    // Unplanned outages logic
    if (outage.type === 'unplanned') {
        if (outage.end_time === "Brak danych") {
            return { visible: false };
        }
        const endTime = new Date(outage.end_time);

        // For "current" view, hide outages that are already over.
        if (isCurrentView && endTime < now) {
            return { visible: false };
        }

        // For historical view, show all unplanned outages from that day's file.
        return {
            visible: true,
            status: 'Nieplanowana przerwa',
            layerName: 'unplanned',
            popupContent: `<b>Nieplanowana przerwa</b><br>
                <strong>Adres:</strong> ${outage.geocoded_address}<br>
                <strong>Koniec (przewidywany):</strong> ${new Date(outage.end_time).toLocaleString('pl-PL')}<br>
                <strong>Opis:</strong> ${outage.original_description}`
        };
    }

    // Planned outages logic
    if (outage.type === 'planned') {
        if (outage.start_time === "Brak danych" || outage.end_time === "Brak danych") {
            return { visible: false };
        }
        const startTime = new Date(outage.start_time);
        const endTime = new Date(outage.end_time);

        if (isCurrentView) {
            // --- "CURRENT" VIEW LOGIC ---
            const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
            let status, layerName;

            if (now >= startTime && now <= endTime) {
                status = 'Planowana (trwająca)';
                layerName = 'ongoing';
            } else if (startTime > now && startTime <= in24h) {
                status = 'Planowana (w ciągu 24h)';
                layerName = 'next24h';
            } else {
                return { visible: false }; // Hide other planned outages in "current" view
            }

            return {
                visible: true,
                status: status,
                layerName: layerName,
                popupContent: `<b>${status}</b><br>
                    <strong>Adres:</strong> ${outage.geocoded_address}<br>
                    <strong>Początek:</strong> ${startTime.toLocaleString('pl-PL')}<br>
                    <strong>Koniec:</strong> ${endTime.toLocaleString('pl-PL')}<br>
                    <strong>Opis:</strong> ${outage.original_description}`
            };

        } else {
            // --- HISTORICAL DATE VIEW LOGIC ---
            // Show all planned outages for the given day, regardless of time.
            return {
                visible: true,
                status: 'Planowana na ten dzień',
                layerName: 'ongoing', // Use 'ongoing' layer for consistent color (orange)
                popupContent: `<b>Planowana na ten dzień</b><br>
                    <strong>Adres:</strong> ${outage.geocoded_address}<br>
                    <strong>Początek:</strong> ${startTime.toLocaleString('pl-PL')}<br>
                    <strong>Koniec:</strong> ${endTime.toLocaleString('pl-PL')}<br>
                    <strong>Opis:</strong> ${outage.original_description}`
            };
        }
    }

    return { visible: false };
}


document.addEventListener('DOMContentLoaded', () => {
    const map = L.map('map').setView([52.4064, 16.9252], 12);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    const layers = {
        unplanned: L.layerGroup().addTo(map),
        ongoing: L.layerGroup().addTo(map),
        next24h: L.layerGroup(),
        other: L.layerGroup()
    };

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
        Object.values(layers).forEach(layer => layer.clearLayers());
    }

    function renderOutages(outages, referenceDate, isCurrentView) {
        clearAllLayers();
        
        if (!outages || outages.length === 0) {
            return; 
        }

        outages.forEach(outage => {
            const result = categorizeOutage(outage, referenceDate, isCurrentView);

            if (result.visible) {
                // The 'other' layer is no longer used by categorizeOutage for visible markers,
                // but we keep it in the layers control for consistency.
                const targetLayer = layers[result.layerName] || layers.other;
                const marker = L.marker([outage.lat, outage.lon], { icon: icons[result.layerName] })
                    .addTo(targetLayer)
                    .bindPopup(result.popupContent);
                
                marker.on('mouseover', function (e) { this.openPopup(); });
                marker.on('mouseout', function (e) { this.closePopup(); });
            }
        });
    }

    const overlayMaps = {
        "Nieplanowane": layers.unplanned,
        "Planowane (trwające)": layers.ongoing,
        "Planowane (w ciągu 24h)": layers.next24h,
        "Planowane (inne)": layers.other
    };
    L.control.layers(null, overlayMaps).addTo(map);

    let masterIndex = [];
    let allDataCache = {}; 
    let lastEtag = null; 

    async function loadDataForSelection(selectedValue) {
        let dataPayload = {};
        let referenceDate;
        let dateToFetch;
        let mainInfoText;

        const isCurrentView = selectedValue === 'current';

        if (isCurrentView) {
            referenceDate = new Date();
            mainInfoText = 'Widok bieżący';
            dateToFetch = masterIndex[0]; 
        } else {
            // For historical views, use a neutral time. The new logic in 
            // categorizeOutage doesn't depend on it for showing/hiding,
            // only for the text in the popup. Noon is fine.
            referenceDate = new Date(selectedValue);
            referenceDate.setHours(12, 0, 0, 0); 
            mainInfoText = `Dane dla: ${selectedValue}`;
            dateToFetch = selectedValue;
        }

        if (!dateToFetch) {
            infoControl.update('Brak dostępnych danych do załadowania.');
            clearAllLayers();
            return;
        }

        infoControl.update(mainInfoText, 'Ładowanie...');
        
        if (allDataCache[dateToFetch]) {
            dataPayload = allDataCache[dateToFetch];
        } else {
            const response = await fetch(`data/outages_${dateToFetch}.json`, { cache: 'no-store' });
            if (!response.ok) {
                infoControl.update(`Błąd ładowania danych dla ${dateToFetch}`);
                clearAllLayers();
                return;
            }
            dataPayload = await response.json();
            allDataCache[dateToFetch] = dataPayload;
        }
        
        renderOutages(dataPayload.outages || [], referenceDate, isCurrentView);
        infoControl.update(mainInfoText, dataPayload.last_update);
    }

    async function fetchMasterIndexAndLoadData() {
        try {
            const response = await fetch('data/master_index.json', { cache: 'no-store' });
            if (!response.ok) throw new Error('Master index not found');
            const newIndex = await response.json();
            
            if (JSON.stringify(newIndex) !== JSON.stringify(masterIndex)) {
                masterIndex = newIndex;
                dateSelector.innerHTML = ''; 
                
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
                
                const urlParams = new URLSearchParams(window.location.search);
                const dateParam = urlParams.get('date');

                if (dateParam && masterIndex.includes(dateParam)) {
                    dateSelector.value = dateParam;
                    loadDataForSelection(dateParam);
                } else {
                    dateSelector.value = 'current';
                    loadDataForSelection('current');
                }
            } else if (dateSelector.value === 'current') {
                loadDataForSelection('current');
            }
        } catch (error) {
            console.error('Error loading master index:', error);
            infoControl.update('Błąd ładowania indeksu danych historycznych.');
        }
    }


    fetchMasterIndexAndLoadData();
    
    dateSelector.addEventListener('change', (event) => {
        loadDataForSelection(event.target.value);
    });

    setInterval(() => {
        if (dateSelector.value === 'current') {
            loadDataForSelection('current');
        }
    }, 60 * 1000);

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

// For testing purposes
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { categorizeOutage };
}
