import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

/**
 * Tile source is configurable at build time (VITE_TILE_URL). The default is the public OpenStreetMap server, whose usage
 * policy only allows light use with attribution: for production traffic use a provider whose terms fit (see docs/GPS.md).
 * No secret key is ever placed in the frontend.
 */
const TILE_URL = (import.meta.env.VITE_TILE_URL as string | undefined) ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = (import.meta.env.VITE_TILE_ATTRIBUTION as string | undefined) ?? '&copy; <a href="https://www.openstreetmap.org/copyright">Contributeurs OpenStreetMap</a>';

export type LatLng = [number, number];

interface Props {
    /** One polyline per segment (a pause starts a new segment: no line is drawn across it). */
    segments: LatLng[][];
    position?: LatLng | null;
    accuracy?: number | null;
    follow?: boolean;
    className?: string;
    label: string;
}

export default function MapView({ segments, position, accuracy, follow = false, className = 'h-72', label }: Props) {
    const el = useRef<HTMLDivElement>(null);
    const map = useRef<L.Map | null>(null);
    const layer = useRef<L.LayerGroup | null>(null);

    useEffect(() => {
        if (!el.current || map.current) return;
        // Kinshasa as a neutral starting view until a position or a track is known.
        map.current = L.map(el.current, { zoomControl: true, attributionControl: true }).setView([-4.325, 15.322], 12);
        L.tileLayer(TILE_URL, { maxZoom: 19, attribution: ATTRIBUTION }).addTo(map.current);
        layer.current = L.layerGroup().addTo(map.current);
        return () => {
            map.current?.remove();
            map.current = null;
        };
    }, []);

    useEffect(() => {
        const m = map.current;
        const g = layer.current;
        if (!m || !g) return;
        g.clearLayers();
        const all: LatLng[] = [];
        segments.forEach((seg) => {
            if (seg.length > 1) L.polyline(seg, { color: '#0f766e', weight: 5, opacity: 0.9 }).addTo(g);
            if (seg.length === 1) L.circleMarker(seg[0], { radius: 5, color: '#0f766e', fillOpacity: 1 }).addTo(g);
            all.push(...seg);
        });
        if (segments[0]?.length) L.circleMarker(segments[0][0], { radius: 7, color: '#15803d', fillColor: '#22c55e', fillOpacity: 1 }).bindTooltip('Départ').addTo(g);
        if (position) {
            if (accuracy) L.circle(position, { radius: accuracy, color: '#2563eb', weight: 1, fillOpacity: 0.1 }).addTo(g);
            L.circleMarker(position, { radius: 8, color: '#fff', weight: 3, fillColor: '#2563eb', fillOpacity: 1 }).bindTooltip('Vous êtes ici').addTo(g);
            all.push(position);
        }
        if (follow && position) m.setView(position, Math.max(m.getZoom(), 16));
        else if (all.length > 1) m.fitBounds(L.latLngBounds(all), { padding: [24, 24], maxZoom: 17 });
        else if (all.length === 1) m.setView(all[0], 16);
    }, [segments, position, accuracy, follow]);

    return <div ref={el} role="img" aria-label={label} className={`z-0 w-full overflow-hidden rounded-2xl border border-sand-2 ${className}`} />;
}
