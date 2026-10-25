/*
 * Optional wearable connection over Web Bluetooth (Chrome/Edge on Android and desktop, HTTPS only).
 *
 * WHAT IS REAL: the connection, the service discovery and the decoding of three STANDARD Bluetooth SIG profiles
 *   - Heart Rate (service 0x180D, characteristic 0x2A37, notifications)  -> beats per minute
 *   - Battery (0x180F / 0x2A19)                                           -> percentage
 *   - Device Information (0x180A: 0x2A29, 0x2A24, 0x2A26)                 -> manufacturer, model, firmware (text)
 * WHAT IS NOT: the Remax Watch8 custom services (0xd0ff, 0x6287, 6e40ab01-…, 0x3802) are only LISTED. Their format is
 * undocumented, so nothing is decoded from them and no value is ever invented. We never write to the watch, except the
 * standard "enable notifications" descriptor that Web Bluetooth performs itself for startNotifications().
 * Whether the real Watch8 exposes the standard heart-rate service is UNKNOWN until a physical test.
 */

export const GATT = {
    heartRate: 0x180d,
    heartRateMeasurement: 0x2a37,
    battery: 0x180f,
    batteryLevel: 0x2a19,
    deviceInfo: 0x180a,
    manufacturer: 0x2a29,
    model: 0x2a24,
    firmware: 0x2a26,
} as const;

/** Custom services seen with nRF Connect on the Watch8: requested so they can be LISTED, never decoded. */
export const CUSTOM_SERVICES = ['0000d0ff-3c17-d293-8e48-14fe2e4da212', '00006287-3c17-d293-8e48-14fe2e4da212', '6e40ab01-b5a3-f393-e0a9-e50e24dcca9e', 0x3802] as const;

export const DECODER_HEART_RATE = 'gatt-hrs-1';

export type WatchPhase =
    | 'none' // no watch associated
    | 'unsupported' // browser cannot do Web Bluetooth
    | 'permission_required' // user has not (or not yet) granted access
    | 'searching'
    | 'detected'
    | 'connecting'
    | 'connected'
    | 'reading' // a measurement is being read
    | 'syncing'
    | 'synced'
    | 'lost' // connection lost
    | 'incompatible'
    | 'uninterpreted' // connected, data exists but cannot be interpreted yet
    | 'error';

export const PHASE_LABEL: Record<WatchPhase, string> = {
    none: 'Aucune montre associée',
    unsupported: 'Indisponible sur ce navigateur',
    permission_required: 'Autorisation requise',
    searching: "Recherche d'appareils…",
    detected: 'Appareil détecté',
    connecting: 'Connexion en cours…',
    connected: 'Connectée',
    reading: 'Lecture en cours…',
    syncing: 'Synchronisation en cours…',
    synced: 'Synchronisation réussie',
    lost: 'Connexion perdue',
    incompatible: 'Appareil incompatible',
    uninterpreted: 'Données reçues mais pas encore interprétées',
    error: 'Erreur de communication',
};

// ---------- pure decoders (Bluetooth SIG formats) ----------

export interface HeartRateSample {
    bpm: number;
    contact: 'unsupported' | 'not_detected' | 'detected';
    rrMs: number[];
}

/** Heart Rate Measurement (0x2A37). Returns null for anything that is not a plausible reading: never a made-up value. */
export function parseHeartRate(view: DataView): HeartRateSample | null {
    if (view.byteLength < 2) return null;
    const flags = view.getUint8(0);
    const is16 = (flags & 0x01) !== 0;
    const need = 1 + (is16 ? 2 : 1);
    if (view.byteLength < need) return null;
    const bpm = is16 ? view.getUint16(1, true) : view.getUint8(1);
    let off = need;
    const contactBits = (flags >> 1) & 0x03; // 0,1 = not supported ; 2 = supported, not detected ; 3 = detected
    const contact = contactBits === 2 ? 'not_detected' : contactBits === 3 ? 'detected' : 'unsupported';
    if (flags & 0x08) off += 2; // energy expended: ignored on purpose (definition and accuracy unknown)
    const rr: number[] = [];
    if (flags & 0x10) for (; off + 1 < view.byteLength; off += 2) rr.push(Math.round((view.getUint16(off, true) / 1024) * 1000));
    if (bpm < 20 || bpm > 250) return null; // 0 = "no reading", > 250 = not physiological
    if (contact === 'not_detected') return null; // the sensor says it is not on the skin
    return { bpm, contact, rrMs: rr };
}

export function parseBattery(view: DataView): number | null {
    if (view.byteLength < 1) return null;
    const v = view.getUint8(0);
    return v >= 0 && v <= 100 ? v : null;
}

export function decodeText(view: DataView): string | null {
    try {
        const s = new TextDecoder('utf-8', { fatal: true }).decode(view).replace(/\0+$/, '').trim();
        return s.length > 0 && s.length <= 64 ? s : null;
    } catch {
        return null;
    }
}

// ---------- environment & errors ----------

export function webBluetoothSupport(): { supported: boolean; reason?: string } {
    if (typeof navigator === 'undefined' || !('bluetooth' in navigator)) {
        return { supported: false, reason: "Ce navigateur ne prend pas en charge Web Bluetooth (par exemple Safari sur iPhone ou Firefox). Utilisez Chrome sur Android ou sur ordinateur. Une application native (Capacitor) serait nécessaire pour iPhone." };
    }
    if (typeof window !== 'undefined' && !window.isSecureContext) return { supported: false, reason: 'Web Bluetooth exige une connexion sécurisée (HTTPS).' };
    return { supported: true };
}

export type BleProblem = 'cancelled' | 'permission_denied' | 'insecure' | 'not_found' | 'lost' | 'incompatible' | 'unsupported' | 'error';

export function describeBleError(e: unknown): { problem: BleProblem; message: string } {
    const name = (e as { name?: string })?.name ?? '';
    const msg = String((e as { message?: string })?.message ?? '');
    if (name === 'NotFoundError' && /cancel/i.test(msg)) return { problem: 'cancelled', message: "Aucun appareil choisi. Rien n'a été connecté." };
    if (name === 'NotFoundError') return { problem: 'not_found', message: "Aucun appareil ou service compatible trouvé. Vérifiez que la montre est allumée, proche, non connectée à une autre application, puis réessayez." };
    if (name === 'NotAllowedError' || name === 'SecurityError') return { problem: name === 'SecurityError' ? 'insecure' : 'permission_denied', message: "L'accès Bluetooth a été refusé ou bloqué. Autorisez-le dans les réglages du navigateur (et activez la localisation sur Android si nécessaire), puis réessayez." };
    if (name === 'NetworkError' || /disconnected|connection/i.test(msg)) return { problem: 'lost', message: 'La connexion avec la montre a été perdue. Rapprochez-la du téléphone et reconnectez-la.' };
    if (name === 'NotSupportedError') return { problem: 'incompatible', message: "Cet appareil n'expose pas les fonctions demandées." };
    if (name === 'TypeError' && /bluetooth/i.test(msg)) return { problem: 'unsupported', message: 'Web Bluetooth est indisponible.' };
    return { problem: 'error', message: 'Erreur de communication avec la montre. Réessayez ; si cela persiste, redémarrez le Bluetooth.' };
}

// ---------- minimal Web Bluetooth typings (no extra dependency) ----------

export interface BtCharacteristic extends EventTarget {
    uuid: string;
    value?: DataView;
    properties: { read: boolean; notify: boolean; write: boolean; writeWithoutResponse: boolean; indicate: boolean };
    readValue(): Promise<DataView>;
    startNotifications(): Promise<BtCharacteristic>;
    stopNotifications(): Promise<BtCharacteristic>;
}
export interface BtService {
    uuid: string;
    getCharacteristic(c: number | string): Promise<BtCharacteristic>;
    getCharacteristics(): Promise<BtCharacteristic[]>;
}
export interface BtServer {
    connected: boolean;
    connect(): Promise<BtServer>;
    disconnect(): void;
    getPrimaryServices(): Promise<BtService[]>;
    getPrimaryService(s: number | string): Promise<BtService>;
}
export interface BtDevice extends EventTarget {
    id: string;
    name?: string;
    gatt?: BtServer;
}

export interface WatchInfo {
    name: string | null;
    id: string;
    manufacturer: string | null;
    model: string | null;
    firmware: string | null;
    battery: number | null;
    standardServices: ('heart_rate' | 'battery' | 'device_info')[];
    customServices: string[];
    otherServices: string[];
}

const bt = () => (navigator as unknown as { bluetooth: { requestDevice(o: unknown): Promise<BtDevice>; getDevices?: () => Promise<BtDevice[]> } }).bluetooth;

const short = (u: string) => (u.startsWith('0000') && u.endsWith('-0000-1000-8000-00805f9b34fb') ? `0x${u.slice(4, 8)}` : u);
const STD = { [`0x${GATT.heartRate.toString(16)}`]: 'heart_rate', [`0x${GATT.battery.toString(16)}`]: 'battery', [`0x${GATT.deviceInfo.toString(16)}`]: 'device_info' } as const;

/** Asks the browser chooser (must be called from a click). `all` shows every BLE device instead of names starting with "Watch". */
export async function pickDevice(all = false): Promise<BtDevice> {
    const optionalServices = [GATT.heartRate, GATT.battery, GATT.deviceInfo, ...CUSTOM_SERVICES];
    return bt().requestDevice(all ? { acceptAllDevices: true, optionalServices } : { filters: [{ namePrefix: 'Watch' }], optionalServices });
}

/** Devices the user already authorised (not supported everywhere): lets the app list them without a new prompt. */
export async function previouslyAuthorised(): Promise<BtDevice[]> {
    try {
        return (await bt().getDevices?.()) ?? [];
    } catch {
        return [];
    }
}

/** Connects and describes the device. Reads only: battery and device information strings. */
export async function connectAndDescribe(device: BtDevice): Promise<{ server: BtServer; info: WatchInfo }> {
    const server = await device.gatt!.connect();
    const services = await server.getPrimaryServices().catch(() => [] as BtService[]);
    const info: WatchInfo = { name: device.name ?? null, id: device.id, manufacturer: null, model: null, firmware: null, battery: null, standardServices: [], customServices: [], otherServices: [] };
    for (const s of services) {
        const u = short(s.uuid);
        const std = (STD as Record<string, 'heart_rate' | 'battery' | 'device_info'>)[u];
        if (std) info.standardServices.push(std);
        else if ((CUSTOM_SERVICES as readonly (string | number)[]).some((c) => (typeof c === 'number' ? `0x${c.toString(16).padStart(4, '0')}` : c) === u)) info.customServices.push(u);
        else info.otherServices.push(u);
    }
    const read = async (svc: number, ch: number) => {
        try {
            return await (await (await server.getPrimaryService(svc)).getCharacteristic(ch)).readValue();
        } catch {
            return null;
        }
    };
    if (info.standardServices.includes('battery')) {
        const v = await read(GATT.battery, GATT.batteryLevel);
        info.battery = v ? parseBattery(v) : null;
    }
    if (info.standardServices.includes('device_info')) {
        const [m, mo, f] = await Promise.all([read(GATT.deviceInfo, GATT.manufacturer), read(GATT.deviceInfo, GATT.model), read(GATT.deviceInfo, GATT.firmware)]);
        info.manufacturer = m ? decodeText(m) : null;
        info.model = mo ? decodeText(mo) : null;
        info.firmware = f ? decodeText(f) : null;
    }
    return { server, info };
}

export interface TimedSample extends HeartRateSample {
    at: number; // epoch ms when the notification ARRIVED (the characteristic carries no timestamp)
}

/** Subscribes to heart-rate notifications for `seconds`, returns what was really received (possibly nothing). */
export async function readHeartRate(server: BtServer, seconds = 30, onSample?: (s: TimedSample) => void, signal?: AbortSignal): Promise<TimedSample[]> {
    const ch = await (await server.getPrimaryService(GATT.heartRate)).getCharacteristic(GATT.heartRateMeasurement);
    const out: TimedSample[] = [];
    const handler = (ev: Event) => {
        const v = (ev.target as BtCharacteristic).value;
        const s = v ? parseHeartRate(v) : null;
        if (s) {
            const t = { ...s, at: Date.now() };
            out.push(t);
            onSample?.(t);
        }
    };
    ch.addEventListener('characteristicvaluechanged', handler);
    await ch.startNotifications();
    await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, seconds * 1000);
        signal?.addEventListener('abort', () => { clearTimeout(t); resolve(); });
    });
    ch.removeEventListener('characteristicvaluechanged', handler);
    await ch.stopNotifications().catch(() => undefined);
    return out;
}

/** Deterministic id: re-sending the same reading can never create a duplicate on the server. */
export const measurementClientId = (deviceKey: string, type: string, atMs: number) => `w:${deviceKey}:${type}:${Math.floor(atMs / 1000)}`.slice(0, 64);
