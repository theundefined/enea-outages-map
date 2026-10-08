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
            } else if (startTime > in24h) {
                status = 'Planowana (>24h)';
                layerName = 'other';
            }
            else {
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
            const selectedDay = new Date(now); // 'now' is the referenceDate from loadDataForSelection
            selectedDay.setHours(0, 0, 0, 0);
            const nextDay = new Date(selectedDay);
            nextDay.setDate(nextDay.getDate() + 1);

            // Show if the outage period overlaps with the selected day.
            // (outage starts before the next day) AND (outage ends after the day started)
            if (startTime < nextDay && endTime > selectedDay) {
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
            return { visible: false };
        }
    }

    return { visible: false };
}

const LAYER_ORDER = ['unplanned', 'ongoing', 'next24h', 'other'];

// Groups visible outages into one marker per (layer, coordinates). Groups of different layers
// at the same coordinates get increasing offsetIndex values so their markers don't overlap.
function groupVisibleOutages(outages, now, isCurrentView) {
    const groups = new Map();

    outages.forEach(outage => {
        const result = categorizeOutage(outage, now, isCurrentView);
        if (!result.visible) return;

        const layerName = LAYER_ORDER.includes(result.layerName) ? result.layerName : 'other';
        const key = `${layerName}|${outage.lat},${outage.lon}`;
        if (!groups.has(key)) {
            groups.set(key, { layerName, lat: outage.lat, lon: outage.lon, entries: [] });
        }
        const group = groups.get(key);
        if (!group.entries.some(entry => entry.popupContent === result.popupContent)) {
            group.entries.push({ popupContent: result.popupContent, startTime: outage.start_time });
        }
    });

    const result = [...groups.values()];
    result.forEach(group => group.entries.sort((a, b) => String(a.startTime).localeCompare(String(b.startTime))));
    result.sort((a, b) => LAYER_ORDER.indexOf(a.layerName) - LAYER_ORDER.indexOf(b.layerName));

    const offsetsByCoords = {};
    result.forEach(group => {
        const coords = `${group.lat},${group.lon}`;
        group.offsetIndex = offsetsByCoords[coords] || 0;
        offsetsByCoords[coords] = group.offsetIndex + 1;
    });

    return result;
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

    const iconColors = { unplanned: 'red', ongoing: 'orange', next24h: 'yellow', other: 'grey' };
    const MARKER_OFFSET_PX = 14;
    const iconCache = {};

    // Markers of different layers at the same point are shifted right so all of them stay clickable.
    // popupAnchor is relative to iconAnchor, so it is shifted by the same amount the other way.
    function getIcon(layerName, offsetIndex) {
        const key = `${layerName}|${offsetIndex}`;
        if (!iconCache[key]) {
            const dx = offsetIndex * MARKER_OFFSET_PX;
            iconCache[key] = new L.Icon({
                iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-${iconColors[layerName]}.png`,
                shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
                iconSize: [25, 41], iconAnchor: [12 - dx, 41], popupAnchor: [1 + dx, -34], shadowSize: [41, 41]
            });
        }
        return iconCache[key];
    }

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

        groupVisibleOutages(outages, referenceDate, isCurrentView).forEach(group => {
            const contents = group.entries.map(entry => entry.popupContent);
            const n = contents.length;
            const noun = (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14)) ? 'przerwy' : 'przerw';
            const header = n > 1 ? `<b>${n} ${noun} w tym miejscu</b><hr>` : '';
            const marker = L.marker([group.lat, group.lon], { icon: getIcon(group.layerName, group.offsetIndex) })
                .addTo(layers[group.layerName])
                .bindPopup(header + contents.join('<hr>'), { maxHeight: 300 });

            marker.on('mouseover', function () { this.openPopup(); });
        });
    }

    const overlayMaps = {
        "Nieplanowane": layers.unplanned,
        "Planowane (trwające)": layers.ongoing,
        "Planowane (w ciągu 24h)": layers.next24h,
        "Planowane (>24h)": layers.other
    };
    L.control.layers(null, overlayMaps).addTo(map);

    let masterIndex = [];
    let allDataCache = {};

    // Re-rendering clears all layers, which would close a popup the user is reading.
    let popupOpen = false;
    map.on('popupopen', () => { popupOpen = true; });
    map.on('popupclose', () => { popupOpen = false; });

    async function fetchDayData(date, fresh) {
        if (!fresh && allDataCache[date]) {
            return allDataCache[date];
        }
        const response = await fetch(`data/outages_${date}.json`, { cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        allDataCache[date] = await response.json();
        return allDataCache[date];
    }

    // fresh: bypass the in-memory cache; quiet: background refresh that keeps the current
    // map on errors and defers rendering while a popup is open (the data is cached for the next tick).
    async function loadDataForSelection(selectedValue, { fresh = false, quiet = false } = {}) {
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

        if (!quiet) infoControl.update(mainInfoText, 'Ładowanie...');

        let dataPayload;
        try {
            dataPayload = await fetchDayData(dateToFetch, fresh);
        } catch (error) {
            console.error(`Error loading data for ${dateToFetch}:`, error);
            if (!quiet) {
                infoControl.update(`Błąd ładowania danych dla ${dateToFetch}`);
                clearAllLayers();
            }
            return;
        }

        // The user may have switched views while the request was in flight.
        if (dateSelector.value !== selectedValue) return;
        if (quiet && popupOpen) return;

        renderOutages(dataPayload.outages || [], referenceDate, isCurrentView);
        infoControl.update(mainInfoText, dataPayload.last_update);
    }

    // Fetches master_index.json and rebuilds the selector if it changed, keeping the current selection.
    async function updateMasterIndex() {
        const response = await fetch('data/master_index.json', { cache: 'no-store' });
        if (!response.ok) throw new Error('Master index not found');
        const newIndex = await response.json();
        if (JSON.stringify(newIndex) === JSON.stringify(masterIndex)) return;

        const previousSelection = dateSelector.value;
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

        if (previousSelection && (previousSelection === 'current' || masterIndex.includes(previousSelection))) {
            dateSelector.value = previousSelection;
        }
    }

    async function initialLoad() {
        try {
            await updateMasterIndex();
        } catch (error) {
            console.error('Error loading master index:', error);
            infoControl.update('Błąd ładowania indeksu danych historycznych.');
            return;
        }

        const dateParam = new URLSearchParams(window.location.search).get('date');
        dateSelector.value = dateParam && masterIndex.includes(dateParam) ? dateParam : 'current';
        loadDataForSelection(dateSelector.value);
    }

    async function refresh() {
        try {
            await updateMasterIndex();
        } catch (error) {
            console.error('Error refreshing master index:', error);
        }
        // Only the newest day still changes; older days are final.
        const selected = dateSelector.value;
        if (selected === 'current' || selected === masterIndex[0]) {
            loadDataForSelection(selected, { fresh: true, quiet: true });
        }
    }

    initialLoad();

    dateSelector.addEventListener('change', (event) => {
        loadDataForSelection(event.target.value);
    });

    setInterval(refresh, 60 * 1000);

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
    module.exports = { categorizeOutage, groupVisibleOutages };
}