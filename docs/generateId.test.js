const { generateId } = require('./script');

describe('generateId', () => {
    it('should generate a consistent ID for the same input string', () => {
        const input = "test string";
        const id1 = generateId(input);
        const id2 = generateId(input);
        expect(id1).toBe(id2);
    });

    it('should generate different IDs for different input strings', () => {
        const input1 = "test string 1";
        const input2 = "test string 2";
        const id1 = generateId(input1);
        const id2 = generateId(input2);
        expect(id1).not.toBe(id2);
    });

    it('should generate a valid ID starting with "outage-"', () => {
        const input = "some input";
        const id = generateId(input);
        expect(id.startsWith('outage-')).toBe(true);
    });

    it('should handle empty strings', () => {
        const input = "";
        const id = generateId(input);
        expect(id).toBe('outage-0');
    });
});
