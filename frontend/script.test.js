const { categorizeOutage } = require('./script.js');

describe('categorizeOutage', () => {
    // This is the outage that was causing issues.
    const wloscianskaOutage = {
        "type": "unplanned",
        "geocoded_address": "Włościańska, Piątkowo, Poznań, województwo wielkopolskie, 61-691, Polska",
        "lat": 52.4439011,
        "lon": 16.91018,
        "start_time": "Brak danych",
        "end_time": "2025-12-04T11:00:00",
        "original_description": "Poznań os. Bolesława Śmiałego, ul. Włościańska.",
        "id": "4c8a80c90bdf604d473b88245518562f"
    };

    // --- Test Case 1: The problematic scenario ---
    test('should show unplanned outage in historical view even if it ended before noon', () => {
        // Reference date is the end of the day for historical view
        const referenceDate = new Date('2025-12-04T23:59:59');
        const isCurrentView = false;

        const result = categorizeOutage(wloscianskaOutage, referenceDate, isCurrentView);
        
        expect(result.visible).toBe(true);
        expect(result.layerName).toBe('unplanned');
    });

    // --- Test Case 2: "Current" view when the outage is still active ---
    test('should show unplanned outage in current view if it has not ended yet', () => {
        // Pretend "now" is 10:00 on the day of the outage
        const referenceDate = new Date('2025-12-04T10:00:00');
        const isCurrentView = true;
        
        const result = categorizeOutage(wloscianskaOutage, referenceDate, isCurrentView);

        expect(result.visible).toBe(true);
        expect(result.layerName).toBe('unplanned');
    });

    // --- Test Case 3: "Current" view after the outage has ended ---
    test('should HIDE unplanned outage in current view if it has already ended', () => {
        // Pretend "now" is 15:00, after the outage ended at 11:00
        const referenceDate = new Date('2025-12-04T15:00:00');
        const isCurrentView = true;

        const result = categorizeOutage(wloscianskaOutage, referenceDate, isCurrentView);

        expect(result.visible).toBe(false);
    });

    // --- Planned Outage Tests ---
    const plannedOutage = {
        "type": "planned",
        "geocoded_address": "Testowa, Poznań, Polska",
        "lat": 52.4, "lon": 16.9,
        "start_time": "2025-12-05T10:00:00",
        "end_time": "2025-12-05T14:00:00",
        "original_description": "Test planned outage",
        "id": "test-planned-1"
    };

    test('should categorize a future planned outage as "other" in historical view', () => {
        const referenceDate = new Date('2025-12-04T23:59:59'); // Viewing the day before
        const isCurrentView = false;
        
        const result = categorizeOutage(plannedOutage, referenceDate, isCurrentView);
        
        expect(result.visible).toBe(true);
        expect(result.layerName).toBe('other');
        expect(result.status).toBe('Planowana (przyszła)');
    });

    test('should categorize a past planned outage as "other" and "zakończona" in historical view', () => {
        const referenceDate = new Date('2025-12-06T23:59:59'); // Viewing the day after
        const isCurrentView = false;

        const result = categorizeOutage(plannedOutage, referenceDate, isCurrentView);

        expect(result.visible).toBe(true);
        expect(result.layerName).toBe('other');
        expect(result.status).toBe('Planowana (zakończona)');
    });
    
    test('should categorize an ongoing planned outage correctly in current view', () => {
        const referenceDate = new Date('2025-12-05T12:00:00'); // "now" is during the outage
        const isCurrentView = true;

        const result = categorizeOutage(plannedOutage, referenceDate, isCurrentView);

        expect(result.visible).toBe(true);
        expect(result.layerName).toBe('ongoing');
        expect(result.status).toBe('Planowana (trwająca)');
    });

    test('should categorize a soon-to-happen planned outage as "next24h" in current view', () => {
        const referenceDate = new Date('2025-12-05T08:00:00'); // "now" is 2 hours before
        const isCurrentView = true;
        
        const result = categorizeOutage(plannedOutage, referenceDate, isCurrentView);
        
        expect(result.visible).toBe(true);
        expect(result.layerName).toBe('next24h');
        expect(result.status).toBe('Planowana (w ciągu 24h)');
    });
});
