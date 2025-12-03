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

    const datePicker = document.getElementById('date-picker');
    const loadDateButton = document.getElementById('load-date');
    const infoControl = L.control(); // Define infoControl globally or in a scope accessible by updateInfo

    infoControl.onAdd = function (map) {
        this._div = L.DomUtil.create('div', 'info');
        this.update();
        return this._div;
    };
    infoControl.update = function (lastUpdate = 'N/A') {
        const updateTime = lastUpdate !== 'N/A' ? new Date(lastUpdate).toLocaleString('pl-PL') : 'Brak danych';
        this._div.innerHTML = '<h4>Informacje</h4>' + `Ostatnia aktualizacja danych: ${updateTime} (UTC)`;
    };
    infoControl.addTo(map);


    function clearAllLayers() {
        unplannedLayer.clearLayers();
        ongoingPlannedLayer.clearLayers();
        next24hPlannedLayer.clearLayers();
        otherPlannedLayer.clearLayers();
    }

    function renderOutages(outages, selectedDate) {
        clearAllLayers(); // Clear existing markers

        const now = selectedDate || new Date(); // Use selectedDate if provided, otherwise current time
        const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        
        // Filter out outages that have already ended and are not ongoing
        const relevantOutages = outages.filter(outage => {
            const endTime = new Date(outage.end_time);
            return endTime > now; // Only show outages that haven't ended yet (or are ongoing)
        });

        relevantOutages.forEach(outage => {
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

    // --- Layer Control ---
    const overlayMaps = {
        "Nieplanowane": unplannedLayer,
        "Planowane (trwające)": ongoingPlannedLayer,
        "Planowane (w ciągu 24h)": next24hPlannedLayer,
        "Planowane (inne)": otherPlannedLayer
    };
    L.control.layers(null, overlayMaps).addTo(map);

    let masterIndex = [];

    // --- Data Loading Function ---
    async function loadOutagesForDate(dateString) {
        clearAllLayers();
        infoControl.update('Ładowanie danych...');
        try {
            const response = await fetch(`data/outages_${dateString}.json`);
            if (!response.ok) {
                if (response.status === 404) {
                    infoControl.update(`Brak danych dla ${dateString}`);
                    return;
                }
                throw new Error(`Failed to load data for ${dateString}: ${response.statusText}`);
            }
            const data = await response.json();
            renderOutages(data, new Date(dateString)); // Pass selected date for accurate "now" comparison
            infoControl.update(`Dane dla: ${dateString}`); // Update info with selected date
        } catch (error) {
            console.error('Error loading outage data:', error);
            infoControl.update(`Błąd ładowania danych dla ${dateString}`);
        }
    }

    // --- Initial Load ---
    fetch('data/master_index.json')
        .then(response => response.ok ? response.json() : Promise.reject('Index not found'))
        .then(index => {
            masterIndex = index;
            if (masterIndex.length > 0) {
                // Set date picker to the latest available date
                const latestDate = masterIndex[0];
                datePicker.value = latestDate;
                loadOutagesForDate(latestDate);
            } else {
                infoControl.update('Brak dostępnych danych historycznych.');
            }
        })
        .catch(error => {
            console.error('Error loading master index:', error);
            infoControl.update('Błąd ładowania indeksu danych historycznych.');
        });
    
    // --- Event Listener for Date Picker ---
    loadDateButton.addEventListener('click', () => {
        const selectedDate = datePicker.value;
        if (selectedDate && masterIndex.includes(selectedDate)) {
            loadOutagesForDate(selectedDate);
        } else if (selectedDate) {
             infoControl.update(`Brak danych dla ${selectedDate}`);
             clearAllLayers();
        } else {
             infoControl.update(`Wybierz datę.`);
        }
    });

    // Add some style for the info box - moved to style.css for better practice, but kept here for now for quick testing
    // const style = document.createElement('style');
    // style.innerHTML = `
    //     .info {
    //         padding: 6px 8px;
    //         font: 14px/16px Arial, Helvetica, sans-serif;
    //         background: white;
    //         background: rgba(255,255,255,0.8);
    //         box-shadow: 0 0 15px rgba(0,0,0,0.2);
    //         border-radius: 5px;
    //     }
    //     .info h4 {
    //         margin: 0 0 5px;
    //         color: #777;
    //     }
    // `;
    // document.head.appendChild(style);
});
