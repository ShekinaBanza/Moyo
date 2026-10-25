import { describe, expect, it } from 'vitest';
import { fmtDuration, fmtNumber, minuteToClock, NA } from './format';

describe('format helpers', () => {
    it('shows "Non disponible" instead of zero for missing values', () => {
        expect(fmtDuration(null)).toBe(NA);
        expect(fmtNumber(undefined)).toBe(NA);
        expect(fmtNumber(0)).not.toBe(NA);
    });
    it('formats durations', () => {
        expect(fmtDuration(450)).toBe('7 h 30');
        expect(fmtDuration(45)).toBe('45 min');
    });
    it('formats minute of day across midnight', () => {
        expect(minuteToClock(23 * 60 + 30)).toBe('23:30');
        expect(minuteToClock(1500)).toBe('01:00');
    });
});
