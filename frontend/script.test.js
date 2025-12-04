const { categorizeOutage } = require('./script.js');

describe('categorizeOutage', () => {

    // --- Unplanned Outage Test Data ---
    const unplannedOutage = {
        type: "unplanned",
        end_time: "2025-12-04T11:00:00",
    };

    // --- Planned Outage Test Data ---
    const plannedOutage = {
        type: "planned",
        start_time: "2025-12-05T10:00:00",
        end_time: "2025-12-05T14:00:00",
    };

    // --- UNPLANNED OUTAGE TESTS (Should be unaffected) ---

    describe('Unplanned Outages', () => {
        test('should SHOW in historical view', () => {
            const result = categorizeOutage(unplannedOutage, new Date('2025-12-04T12:00:00'), false);
            expect(result.visible).toBe(true);
            expect(result.layerName).toBe('unplanned');
        });

        test('should SHOW in current view if not ended', () => {
            const result = categorizeOutage(unplannedOutage, new Date('2025-12-04T10:00:00'), true);
            expect(result.visible).toBe(true);
        });

        test('should HIDE in current view if ended', () => {
            const result = categorizeOutage(unplannedOutage, new Date('2025-12-04T15:00:00'), true);
            expect(result.visible).toBe(false);
        });
    });

    // --- PLANNED OUTAGE TESTS (Reflects new requirements) ---

    describe('Planned Outages', () => {
        // --- Test Group 1: Historical View (`isCurrentView: false`) ---
        describe('in Historical View', () => {
            const isCurrentView = false;
            // The reference date IS important for historical view to determine the selected day.
            const referenceDateForDec5 = new Date('2025-12-05T12:00:00'); 

            test('should SHOW if it overlaps with the selected day', () => {
                const result = categorizeOutage(plannedOutage, referenceDateForDec5, isCurrentView);
                expect(result.visible).toBe(true);
            });
            
            test('should HIDE if it does not overlap with the selected day', () => {
                // This outage is on Dec 5, but we are viewing Dec 4. It should be hidden.
                const referenceDateForDec4 = new Date('2025-12-04T12:00:00');
                const result = categorizeOutage(plannedOutage, referenceDateForDec4, isCurrentView);
                expect(result.visible).toBe(false);
            });

            test('should have status "Planowana na ten dzień" when visible', () => {
                const result = categorizeOutage(plannedOutage, referenceDateForDec5, isCurrentView);
                expect(result.status).toBe('Planowana na ten dzień');
            });

            test('should use "ongoing" layer for consistent color when visible', () => {
                const result = categorizeOutage(plannedOutage, referenceDateForDec5, isCurrentView);
                expect(result.layerName).toBe('ongoing');
            });
        });

        // --- Test Group 2: Current View (`isCurrentView: true`) ---
        describe('in Current View', () => {
            const isCurrentView = true;

            test('should SHOW as "trwająca" if currently active', () => {
                const now = new Date('2025-12-05T12:00:00'); // During the outage
                const result = categorizeOutage(plannedOutage, now, isCurrentView);
                expect(result.visible).toBe(true);
                expect(result.status).toBe('Planowana (trwająca)');
                expect(result.layerName).toBe('ongoing');
            });

            test('should SHOW as "w ciągu 24h" if starting soon', () => {
                const now = new Date('2025-12-05T08:00:00'); // 2 hours before start
                const result = categorizeOutage(plannedOutage, now, isCurrentView);
                expect(result.visible).toBe(true);
                expect(result.status).toBe('Planowana (w ciągu 24h)');
                expect(result.layerName).toBe('next24h');
            });


            test('should HIDE if already finished', () => {
                const now = new Date('2025-12-05T16:00:00'); // 2 hours after end
                const result = categorizeOutage(plannedOutage, now, isCurrentView);
                expect(result.visible).toBe(false);
            });

            test('should SHOW as ">24h" if starting far in the future', () => {
                const now = new Date('2025-12-04T08:00:00'); // More than 24h before start
                const result = categorizeOutage(plannedOutage, now, isCurrentView);
                expect(result.visible).toBe(true);
                expect(result.status).toBe('Planowana (>24h)');
                expect(result.layerName).toBe('other');
            });
        });
    });
});