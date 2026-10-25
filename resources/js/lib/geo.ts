/*
 * Client-side GPS helpers. The server is authoritative: it recomputes distance from the stored points.
 * These helpers only give a LIVE estimate while recording; constants mirror GpsDistanceCalculator.php.
 */
export const MAX_ACCURACY_M = 50;
export const MIN_STEP_M = 3;
export const MAX_SPEED_MS = 15;
export const GAP_SECONDS = 300;
const R = 6371008.8;

export interface GeoPoint {
    lat: number;
    lng: number;
    accuracy: number | null;
    t: number; // epoch seconds
    segment: number;
}

export function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const rad = (d: number) => (d * Math.PI) / 180;
    const dp = rad(lat2 - lat1);
    const dl = rad(lng2 - lng1);
    const a = Math.sin(dp / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dl / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export interface LiveStats {
    distanceM: number;
    durationS: number;
    accepted: number;
    rejected: number;
    gaps: number;
}

/** Same rules as the server: path length, accuracy filter, jitter filter, speed filter, no gap/segment bridging. */
export function liveStats(points: GeoPoint[]): LiveStats {
    let distanceM = 0;
    let durationS = 0;
    let accepted = 0;
    let rejected = 0;
    let gaps = 0;
    let last: GeoPoint | null = null;
    for (const p of points) {
        if (p.accuracy !== null && p.accuracy > MAX_ACCURACY_M) {
            rejected++;
            continue;
        }
        if (last && last.segment === p.segment) {
            const dt = p.t - last.t;
            if (dt > GAP_SECONDS) {
                gaps++;
                last = null;
            } else {
                const d = haversine(last.lat, last.lng, p.lat, p.lng);
                if (d < MIN_STEP_M) continue;
                if (dt > 0 && d / dt > MAX_SPEED_MS) {
                    rejected++;
                    continue;
                }
                distanceM += d;
                durationS += dt;
            }
        }
        accepted++;
        last = p;
    }
    return { distanceM, durationS, accepted, rejected, gaps };
}

export function fmtKm(m: number | null | undefined): string {
    if (m === null || m === undefined) return 'Non disponible';
    return `${(m / 1000).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} km`;
}

export function fmtClock(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const p = (n: number) => String(n).padStart(2, '0');
    return h > 0 ? `${h}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
}

/** Average pace (min/km) only when distance and time are large enough to be meaningful. */
export function fmtPace(distanceM: number, seconds: number): string | null {
    if (distanceM < 100 || seconds < 60) return null;
    const spk = seconds / (distanceM / 1000);
    return `${Math.floor(spk / 60)}:${String(Math.round(spk % 60)).padStart(2, '0')} min/km`;
}
