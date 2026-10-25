import { describe, expect, it } from 'vitest';
import { fmtPace, haversine, liveStats, type GeoPoint } from './geo';

const p = (lat: number, t: number, acc: number | null = 5, segment = 0): GeoPoint => ({ lat, lng: 0, accuracy: acc, t, segment });

describe('geo helpers', () => {
    it('haversine is about 1112 m per 0.01 degree of latitude', () => {
        expect(haversine(0, 0, 0.01, 0)).toBeGreaterThan(1110);
        expect(haversine(0, 0, 0.01, 0)).toBeLessThan(1114);
    });

    it('follows the path (detour), not first-to-last', () => {
        const s = liveStats([p(0, 0), p(0.005, 100), p(0.01, 200), p(0.005, 300), p(0, 400)]);
        expect(s.distanceM).toBeGreaterThan(2200);
        expect(s.distanceM).toBeLessThan(2250);
    });

    it('rejects inaccurate points and teleports, ignores jitter', () => {
        expect(liveStats([p(0, 0), p(0.001, 60, 300), p(0.002, 120)]).rejected).toBe(1);
        expect(liveStats([p(0, 0), p(0.5, 5)]).rejected).toBe(1);
        expect(liveStats(Array.from({ length: 10 }, (_, i) => p(0.00001 * (i % 2), i * 5))).distanceM).toBe(0);
    });

    it('never bridges a pause segment or a signal gap', () => {
        expect(liveStats([p(0, 0, 5, 0), p(0.001, 60, 5, 0), p(0.05, 1000, 5, 1), p(0.051, 1060, 5, 1)]).distanceM).toBeLessThan(230);
        expect(liveStats([p(0, 0), p(0.001, 60), p(0.01, 700), p(0.011, 760)]).gaps).toBe(1);
    });

    it('gives a pace only when it can be computed properly', () => {
        expect(fmtPace(50, 30)).toBeNull();
        expect(fmtPace(1000, 360)).toBe('6:00 min/km');
    });
});
