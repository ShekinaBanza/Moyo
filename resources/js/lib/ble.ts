/*
 * ISOLATED, READ-ONLY BLE prototype for the Remax "Watch8".
 *
 * STATUS: the proprietary protocol is NOT decoded. This module only
 *   - checks Web Bluetooth availability,
 *   - lets the user pick a device (explicit permission prompt),
 *   - connects over GATT and lists the services/characteristics with their properties,
 *   - optionally reads characteristics flagged READ (read is non-destructive).
 * It NEVER writes to the watch and NEVER turns raw bytes into health values.
 * Raw bytes are only returned for diagnostics; interpreting them requires a verified decoder.
 *
 * Known observed UUIDs (nRF Connect): 0000d0ff-…, 00006287-…, 6e40ab01-… (Nordic-UART-like), 0x3802.
 * These are hints, not documentation.
 */

export const OBSERVED_SERVICES = [
    '0000d0ff-3c17-d293-8e48-14fe2e4da212',
    '00006287-3c17-d293-8e48-14fe2e4da212',
    '6e40ab01-b5a3-f393-e0a9-e50e24dcca9e',
    0x3802,
] as const;

export interface BleSupport {
    supported: boolean;
    reason?: string;
}

export function bleSupport(): BleSupport {
    if (typeof navigator === 'undefined' || !('bluetooth' in navigator)) {
        return {
            supported: false,
            reason: "Web Bluetooth n'est pas disponible sur ce navigateur (par ex. Safari/iOS, Firefox). Utilisez Chrome sur Android ou ordinateur, ou une future application native (Capacitor).",
        };
    }
    if (!window.isSecureContext) return { supported: false, reason: 'Web Bluetooth exige une connexion HTTPS.' };
    return { supported: true };
}

export interface CharacteristicInfo {
    uuid: string;
    properties: string[];
    rawHex?: string;
}
export interface ServiceInfo {
    uuid: string;
    characteristics: CharacteristicInfo[];
}
export interface DeviceReport {
    name: string | null;
    id: string;
    services: ServiceInfo[];
    decoded: false; // always false until a verified decoder exists
}

// Minimal structural types so the prototype compiles without extra @types packages.
interface BtChar {
    uuid: string;
    properties: Record<string, boolean>;
    readValue(): Promise<DataView>;
}
interface BtService {
    uuid: string;
    getCharacteristics(): Promise<BtChar[]>;
}
interface BtServer {
    connected: boolean;
    getPrimaryServices(): Promise<BtService[]>;
    disconnect(): void;
}
interface BtDevice {
    id: string;
    name?: string;
    gatt?: { connect(): Promise<BtServer> };
}

const toHex = (v: DataView) => Array.from(new Uint8Array(v.buffer)).map((b) => b.toString(16).padStart(2, '0')).join(' ');

/** Must be called from a user gesture (click). Throws if the user cancels the chooser. */
export async function inspectDevice(readSafeCharacteristics = false): Promise<DeviceReport> {
    const support = bleSupport();
    if (!support.supported) throw new Error(support.reason);

    const bt = (navigator as unknown as { bluetooth: { requestDevice(o: unknown): Promise<BtDevice> } }).bluetooth;
    const device = await bt.requestDevice({
        filters: [{ namePrefix: 'Watch' }],
        optionalServices: [...OBSERVED_SERVICES],
    });
    const server = await device.gatt!.connect();
    try {
        const services: ServiceInfo[] = [];
        for (const s of await server.getPrimaryServices()) {
            const chars: CharacteristicInfo[] = [];
            for (const c of await s.getCharacteristics()) {
                const properties = Object.entries(c.properties).filter(([, on]) => on).map(([k]) => k);
                const info: CharacteristicInfo = { uuid: c.uuid, properties };
                if (readSafeCharacteristics && c.properties.read) {
                    try {
                        info.rawHex = toHex(await c.readValue());
                    } catch {
                        /* some characteristics refuse reads without pairing: ignore */
                    }
                }
                chars.push(info);
            }
            services.push({ uuid: s.uuid, characteristics: chars });
        }
        return { name: device.name ?? null, id: device.id, services, decoded: false };
    } finally {
        server.disconnect();
    }
}
