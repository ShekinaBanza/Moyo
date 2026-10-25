import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, del, get, patch, post } from '@/lib/api';
import { submitEntry } from '@/lib/offline';
import { connectAndDescribe, DECODER_HEART_RATE, describeBleError, measurementClientId, pickDevice, readHeartRate, webBluetoothSupport, type BtDevice, type BtServer, type TimedSample, type WatchInfo, type WatchPhase } from '@/lib/watch';
import type { Device } from '@/types';

export interface DeviceRecord extends Device {
    identifier?: string | null;
    capabilities?: { measurement_type: string; confirmed: boolean; decoder_version: string | null }[];
}

/**
 * Optional wearable. Every state is derived from what really happened: a watch is "connected" only while a GATT
 * connection exists in this page, and a data type is "supported" only after a real value has been decoded.
 */
export function useWatch() {
    const support = webBluetoothSupport();
    const [record, setRecord] = useState<DeviceRecord | null>(null);
    const [loaded, setLoaded] = useState(false);
    const [phase, setPhase] = useState<WatchPhase>(support.supported ? 'none' : 'unsupported');
    const [info, setInfo] = useState<WatchInfo | null>(null);
    const [problem, setProblem] = useState<string | null>(null);
    const [samples, setSamples] = useState<TimedSample[]>([]);
    const [notice, setNotice] = useState<string | null>(null);
    const bt = useRef<BtDevice | null>(null);
    const server = useRef<BtServer | null>(null);
    const abort = useRef<AbortController | null>(null);
    const userDisconnect = useRef(false); // a ref: the event can fire before React re-renders
    const phaseRef = useRef(phase);
    phaseRef.current = phase;

    const loadRecord = useCallback(async () => {
        try {
            const r = await get<{ data: DeviceRecord[] }>('/api/v1/devices');
            setRecord(r.data[0] ?? null);
        } catch {
            /* offline: keep what we know */
        } finally {
            setLoaded(true);
        }
    }, []);
    useEffect(() => { void loadRecord(); }, [loadRecord]);

    const setStatus = useCallback(async (id: number, status: 'connected' | 'disconnected' | 'error') => {
        await patch(`/api/v1/devices/${id}`, { connection_status: status }).catch(() => undefined);
    }, []);

    const ensureRecord = useCallback(async (device: BtDevice, name: string | null): Promise<DeviceRecord> => {
        const r = await post<{ data: DeviceRecord }>('/api/v1/devices', { name: name || device.name || 'Montre', model: 'Remax Watch8', identifier: device.id });
        setRecord(r.data);
        return r.data;
    }, []);

    const attach = useCallback(async (device: BtDevice) => {
        bt.current = device;
        userDisconnect.current = false;
        setPhase('connecting');
        const { server: s, info: i } = await connectAndDescribe(device);
        server.current = s;
        setInfo(i);
        device.addEventListener('gattserverdisconnected', () => {
            if (userDisconnect.current) { userDisconnect.current = false; return; } // the user chose to disconnect
            setPhase('lost');
            setProblem('La connexion avec la montre a été perdue. Rapprochez-la du téléphone puis reconnectez-la.');
            setRecord((r) => { if (r) void setStatus(r.id, 'disconnected'); return r; });
        });
        const rec = await ensureRecord(device, i.name);
        void setStatus(rec.id, 'connected');
        setPhase(i.standardServices.length ? 'connected' : i.customServices.length ? 'uninterpreted' : 'incompatible');
    }, [ensureRecord, setStatus]);

    /** Must be called from a click: the browser asks the Bluetooth permission now. */
    const connect = useCallback(async (all = false) => {
        setProblem(null);
        setNotice(null);
        if (!support.supported) { setPhase('unsupported'); return; }
        try {
            setPhase('searching');
            const d = await pickDevice(all);
            setPhase('detected');
            await attach(d);
        } catch (e) {
            const d = describeBleError(e);
            setProblem(d.message);
            setPhase(d.problem === 'cancelled' ? (record ? 'none' : 'none') : d.problem === 'permission_denied' || d.problem === 'insecure' ? 'permission_required' : d.problem === 'incompatible' ? 'incompatible' : d.problem === 'lost' ? 'lost' : 'error');
            if (record && d.problem !== 'cancelled') void setStatus(record.id, 'error');
        }
    }, [attach, record, setStatus, support.supported]);

    const reconnect = useCallback(async () => {
        if (!bt.current) return connect();
        setProblem(null);
        try {
            await attach(bt.current);
        } catch (e) {
            const d = describeBleError(e);
            setProblem(d.message);
            setPhase('lost');
        }
    }, [attach, connect]);

    const disconnect = useCallback(async () => {
        abort.current?.abort();
        userDisconnect.current = true;
        setTimeout(() => { userDisconnect.current = false; }, 1500); // some browsers do not fire the event for a deliberate disconnect
        setPhase('none');
        setProblem(null);
        setNotice(null);
        server.current?.disconnect();
        server.current = null;
        setInfo(null);
        setSamples([]);
        if (record) await setStatus(record.id, 'disconnected');
        await loadRecord();
    }, [loadRecord, record, setStatus]);

    const forget = useCallback(async () => {
        await disconnect();
        if (record) await del(`/api/v1/devices/${record.id}`).catch(() => undefined);
        bt.current = null;
        setRecord(null);
    }, [disconnect, record]);

    /** Reads the standard heart-rate service for `seconds`, then stores what was really received. */
    const measureHeartRate = useCallback(async (seconds = 30) => {
        if (!server.current || !record) return;
        setProblem(null);
        setNotice(null);
        setSamples([]);
        setPhase('reading');
        abort.current = new AbortController();
        try {
            const got = await readHeartRate(server.current, seconds, (s) => setSamples((p) => [...p, s]), abort.current.signal);
            if (got.length === 0) {
                setPhase('connected');
                setNotice("Aucune valeur de fréquence cardiaque reçue. Portez la montre au poignet, bien serrée, et vérifiez qu'elle mesure : rien n'a été enregistré.");
                return;
            }
            setPhase('syncing');
            const body = {
                device_id: record.id,
                measurements: got.map((s) => ({
                    client_id: measurementClientId(bt.current?.id ?? String(record.id), 'heart_rate', s.at), measurement_type: 'heart_rate', value_numeric: s.bpm, unit: 'bpm', source_type: 'watch',
                    source_reference: bt.current?.id ?? null, measured_at: new Date(s.at).toISOString(), decoder_version: DECODER_HEART_RATE,
                })),
            };
            const r = await submitEntry<{ accepted: number; duplicates: number; rejected: number }>('/api/v1/measurements/sync', body, 'Fréquence cardiaque (montre)');
            if (r.status === 'queued') {
                setPhase('connected');
                setNotice('Hors ligne : les mesures sont gardées sur cet appareil et seront envoyées au retour du réseau (pas encore enregistrées).');
                return;
            }
            await post(`/api/v1/devices/${record.id}/capabilities`, { measurement_type: 'heart_rate', confirmed: true, decoder_version: DECODER_HEART_RATE, notes: 'Profil standard Bluetooth Heart Rate, lu sur cet appareil.' });
            setPhase('synced');
            setNotice(`${got.length} mesure(s) reçue(s) de la montre et enregistrée(s) comme « non vérifiées ».`);
            await loadRecord();
        } catch (e) {
            const d = describeBleError(e);
            setProblem(d.message);
            setPhase(d.problem === 'lost' ? 'lost' : 'error');
            if (e instanceof ApiError) setProblem(e.message);
        }
    }, [loadRecord, record]);

    const stopMeasure = useCallback(() => abort.current?.abort(), []);

    useEffect(() => () => { abort.current?.abort(); server.current?.disconnect(); }, []);

    return { support, record, loaded, phase, info, problem, samples, notice, connect, reconnect, disconnect, forget, measureHeartRate, stopMeasure, reload: loadRecord, hasBtDevice: () => bt.current !== null };
}
