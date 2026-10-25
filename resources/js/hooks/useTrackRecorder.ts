import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, get, NetworkError, post } from '@/lib/api';
import { liveStats, type GeoPoint } from '@/lib/geo';
import { newClientId, submitEntry } from '@/lib/offline';
import type { Track, TrackPoint } from '@/types';
import type { LatLng } from '@/components/MapView';

export type RecState = 'idle' | 'starting' | 'recording' | 'paused' | 'detached' | 'stopping';

const FLUSH_MS = 10_000;
const SIGNAL_LOST_MS = 60_000;
const BACKGROUND_WARN_S = 30;
const KEY = 'moyo.activeTrack'; // only the track id is kept locally, never coordinates

const geoMessage = (e: GeolocationPositionError): string =>
    e.code === e.PERMISSION_DENIED
        ? "L'autorisation de localisation est refusée. Autorisez-la dans les réglages du navigateur pour enregistrer un trajet."
        : e.code === e.POSITION_UNAVAILABLE
          ? 'Position indisponible : le GPS ne reçoit pas de signal (intérieur, tunnel, GPS désactivé).'
          : 'La position met trop de temps à arriver. Réessayez en extérieur.';

/**
 * Records a GPS track. Location is requested ONLY when the user starts a track; watching stops on pause/finish.
 * Limits (documented in docs/GPS.md): a PWA cannot guarantee tracking with the screen off or the app in background.
 */
export function useTrackRecorder(onChange?: () => void) {
    const [state, setState] = useState<RecState>('idle');
    const [track, setTrack] = useState<Track | null>(null);
    const [points, setPoints] = useState<GeoPoint[]>([]);
    const [position, setPosition] = useState<LatLng | null>(null);
    const [accuracy, setAccuracy] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [warnings, setWarnings] = useState<Record<string, string>>({});
    const [now, setNow] = useState(Date.now());

    const watchId = useRef<number | null>(null);
    const buffer = useRef<GeoPoint[]>([]);
    const trackId = useRef<number | null>(null);
    const segment = useRef(0);
    const lastFix = useRef<number>(0);
    const hiddenAt = useRef<number | null>(null);
    const wake = useRef<{ release(): Promise<void> } | null>(null);
    const stateRef = useRef<RecState>('idle');
    stateRef.current = state;

    const warn = useCallback((k: string, text: string | null) => setWarnings((w) => {
        if (text === null) {
            if (!(k in w)) return w;
            const { [k]: _drop, ...rest } = w;
            return rest;
        }
        return w[k] === text ? w : { ...w, [k]: text };
    }), []);

    const flush = useCallback(async () => {
        if (!trackId.current || buffer.current.length === 0) return;
        const batch = buffer.current.splice(0, buffer.current.length);
        const body = { points: batch.map((p) => ({ lat: p.lat, lng: p.lng, accuracy: p.accuracy, segment: p.segment, captured_at: new Date(p.t * 1000).toISOString() })) };
        try {
            const r = await submitEntry(`/api/v1/tracks/${trackId.current}/points`, body, 'Points GPS du trajet');
            warn('offline', r.status === 'queued' ? 'Hors ligne : les positions sont gardées sur cet appareil et seront envoyées au retour du réseau.' : null);
            if (r.status === 'synced') setTrack((r.data as unknown as Track) ?? null);
        } catch (e) {
            if (e instanceof ApiError && e.status === 404) setError("Ce trajet n'existe plus sur le serveur.");
        }
    }, [warn]);

    const stopWatch = useCallback(() => {
        if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
        watchId.current = null;
        void wake.current?.release().catch(() => undefined);
        wake.current = null;
    }, []);

    const acquireWake = useCallback(async () => {
        try {
            const nav = navigator as Navigator & { wakeLock?: { request(t: 'screen'): Promise<{ release(): Promise<void> }> } };
            wake.current = (await nav.wakeLock?.request('screen')) ?? null;
        } catch {
            wake.current = null; // not supported or refused (battery saver): tracking can stop when the screen turns off
        }
    }, []);

    const startWatch = useCallback(() => {
        lastFix.current = Date.now();
        watchId.current = navigator.geolocation.watchPosition(
            (pos) => {
                const p: GeoPoint = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy ?? null, t: Math.floor(pos.timestamp / 1000), segment: segment.current };
                lastFix.current = Date.now();
                buffer.current.push(p);
                setPoints((prev) => [...prev, p]);
                setPosition([p.lat, p.lng]);
                setAccuracy(p.accuracy);
                warn('signal', null);
                warn('accuracy', p.accuracy !== null && p.accuracy > 50 ? `Position imprécise (± ${Math.round(p.accuracy)} m) : les points trop imprécis ne sont pas comptés.` : null);
            },
            (e) => {
                if (e.code === e.PERMISSION_DENIED) {
                    setError(geoMessage(e));
                    void finishInternal(true, 'permission_lost');
                } else warn('signal', geoMessage(e));
            },
            { enableHighAccuracy: true, maximumAge: 0, timeout: 30_000 },
        );
        void acquireWake();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [acquireWake, warn]);

    const finishInternal = useCallback(async (interrupted: boolean, reason: 'user' | 'permission_lost' | 'signal_lost') => {
        if (!trackId.current) return;
        setState('stopping');
        stopWatch();
        await flush();
        try {
            const r = await post<{ data: Track }>(`/api/v1/tracks/${trackId.current}/finish`, { interrupted, reason });
            setTrack(r.data);
            localStorage.removeItem(KEY);
            trackId.current = null;
            setState('idle');
            onChange?.();
        } catch (e) {
            if (e instanceof NetworkError) {
                setError("Hors ligne : le trajet n'a pas pu être clôturé. Il sera marqué « interrompu » par le serveur s'il reste sans nouvelle position.");
                localStorage.removeItem(KEY);
                trackId.current = null;
                setState('idle');
            } else if (e instanceof ApiError) {
                setError(e.message);
                setState('idle');
            }
        }
    }, [flush, onChange, stopWatch]);

    // Periodic flush + signal watchdog + clock
    useEffect(() => {
        if (state !== 'recording') return;
        const f = setInterval(() => void flush(), FLUSH_MS);
        const s = setInterval(() => {
            setNow(Date.now());
            warn('signal', Date.now() - lastFix.current > SIGNAL_LOST_MS ? 'Signal GPS perdu depuis plus d\'une minute : la distance n\'est plus mesurée tant que le signal ne revient pas.' : null);
        }, 5_000);
        return () => {
            clearInterval(f);
            clearInterval(s);
        };
    }, [state, flush, warn]);

    // Background / screen-off detection + battery
    useEffect(() => {
        const onVis = () => {
            if (document.visibilityState === 'hidden') {
                hiddenAt.current = Date.now();
                void flush();
            } else if (hiddenAt.current && stateRef.current === 'recording') {
                const away = (Date.now() - hiddenAt.current) / 1000;
                if (away > BACKGROUND_WARN_S) warn('background', `L'application est restée en arrière-plan ${Math.round(away)} s : le navigateur a pu suspendre le suivi GPS. La distance de cette période peut manquer.`);
                hiddenAt.current = null;
                void acquireWake();
            }
        };
        document.addEventListener('visibilitychange', onVis);
        let battery: (EventTarget & { level: number; charging: boolean }) | null = null;
        const onBat = () => battery && warn('battery', battery.level < 0.15 && !battery.charging ? 'Batterie faible : le téléphone peut couper le GPS. Pensez à terminer le trajet.' : null);
        const nav = navigator as Navigator & { getBattery?: () => Promise<EventTarget & { level: number; charging: boolean }> };
        void nav.getBattery?.().then((b) => {
            battery = b;
            b.addEventListener('levelchange', onBat);
            b.addEventListener('chargingchange', onBat);
            onBat();
        }).catch(() => undefined);
        return () => {
            document.removeEventListener('visibilitychange', onVis);
            battery?.removeEventListener('levelchange', onBat);
            battery?.removeEventListener('chargingchange', onBat);
        };
    }, [flush, warn, acquireWake]);

    useEffect(() => () => stopWatch(), [stopWatch]);

    const start = useCallback(async () => {
        setError(null);
        setWarnings({});
        if (!('geolocation' in navigator)) {
            setError("La géolocalisation n'est pas disponible sur cet appareil ou ce navigateur.");
            return false;
        }
        setState('starting');
        try {
            // Asks the browser permission now, because the user pressed "Commencer un trajet".
            const first = await new Promise<GeolocationPosition>((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 30_000 }));
            const r = await post<{ data: Track }>('/api/v1/tracks', { client_id: newClientId(), started_at: new Date().toISOString() });
            trackId.current = r.data.id;
            localStorage.setItem(KEY, String(r.data.id));
            segment.current = 0;
            buffer.current = [];
            setPoints([]);
            setTrack(r.data);
            setState('recording');
            const p: GeoPoint = { lat: first.coords.latitude, lng: first.coords.longitude, accuracy: first.coords.accuracy ?? null, t: Math.floor(first.timestamp / 1000), segment: 0 };
            buffer.current.push(p);
            setPoints([p]);
            setPosition([p.lat, p.lng]);
            setAccuracy(p.accuracy);
            startWatch();
            onChange?.();
            return true;
        } catch (e) {
            setState('idle');
            if (typeof GeolocationPositionError !== 'undefined' && e instanceof GeolocationPositionError) setError(geoMessage(e));
            else if (e instanceof ApiError) {
                if ((e.errors as unknown) && (e as ApiError).status === 403) throw e; // consent required: the page asks
                setError(e.message);
            } else if (e instanceof NetworkError) setError("Il faut une connexion Internet pour commencer un trajet (le serveur crée le trajet). Vous pouvez saisir la distance à la main.");
            else setError('Impossible de démarrer le suivi.');
            return false;
        }
    }, [onChange, startWatch]);

    const pause = useCallback(async () => {
        if (!trackId.current) return;
        stopWatch();
        await flush();
        try {
            setTrack((await post<{ data: Track }>(`/api/v1/tracks/${trackId.current}/pause`)).data);
            setState('paused');
        } catch (e) {
            setError(e instanceof ApiError ? e.message : 'Pause impossible hors ligne.');
            if (e instanceof NetworkError) startWatch();
        }
    }, [flush, startWatch, stopWatch]);

    const resume = useCallback(async () => {
        if (!trackId.current) return;
        try {
            const r = await post<{ data: Track }>(`/api/v1/tracks/${trackId.current}/resume`);
            segment.current = r.data.current_segment;
            setTrack(r.data);
            setState('recording');
            startWatch();
        } catch (e) {
            setError(e instanceof ApiError ? e.message : 'Reprise impossible hors ligne.');
        }
    }, [startWatch]);

    /** Re-attach to a track left open on the server (page reloaded). The watch only restarts on user action. */
    const attach = useCallback(async (t: Track) => {
        trackId.current = t.id;
        segment.current = t.current_segment;
        setTrack(t);
        try {
            const r = await get<{ points: TrackPoint[] }>(`/api/v1/tracks/${t.id}`);
            setPoints(r.points.map((p) => ({ lat: p.lat, lng: p.lng, accuracy: p.accuracy_m, t: Math.floor(new Date(p.captured_at.replace(' ', 'T') + (p.captured_at.endsWith('Z') ? '' : 'Z')).getTime() / 1000), segment: p.segment })));
        } catch {
            /* keep what we have */
        }
        setState(t.status === 'paused' ? 'paused' : 'detached');
    }, []);

    const continueHere = useCallback(async () => {
        if (trackId.current === null) return;
        setError(null);
        try {
            // the page was away: start a NEW segment so no straight line is drawn over the missing part
            if (stateRef.current === 'detached') {
                await post(`/api/v1/tracks/${trackId.current}/pause`).catch(() => undefined);
                const r = await post<{ data: Track }>(`/api/v1/tracks/${trackId.current}/resume`);
                segment.current = r.data.current_segment;
                setTrack(r.data);
            }
            setState('recording');
            startWatch();
        } catch (e) {
            setError(e instanceof ApiError ? e.message : 'Reprise impossible.');
        }
    }, [startWatch]);

    const stats = useMemo(() => liveStats(points), [points]);
    const segments = useMemo<LatLng[][]>(() => {
        const bySeg = new Map<number, LatLng[]>();
        points.filter((p) => p.accuracy === null || p.accuracy <= 50).forEach((p) => bySeg.set(p.segment, [...(bySeg.get(p.segment) ?? []), [p.lat, p.lng]]));
        return [...bySeg.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
    }, [points]);
    const elapsed = track && (state === 'recording' || state === 'paused') ? Math.max(stats.durationS, 0) : stats.durationS;

    return {
        state, track, points, segments, position, accuracy, stats, elapsed, error, warnings, now,
        start, pause, resume, attach, continueHere,
        finish: (interrupted = false) => finishInternal(interrupted, 'user'),
        storedTrackId: () => Number(localStorage.getItem(KEY)) || null,
    };
}
