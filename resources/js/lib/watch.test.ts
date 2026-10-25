import { describe, expect, it } from 'vitest';
import { decodeText, describeBleError, measurementClientId, parseBattery, parseHeartRate, webBluetoothSupport } from './watch';

const dv = (...bytes: number[]) => new DataView(new Uint8Array(bytes).buffer);

describe('Heart Rate Measurement decoder (Bluetooth SIG format)', () => {
    it('decodes a uint8 value', () => {
        expect(parseHeartRate(dv(0x00, 72))).toEqual({ bpm: 72, contact: 'unsupported', rrMs: [] });
    });

    it('decodes a uint16 little-endian value', () => {
        expect(parseHeartRate(dv(0x01, 0x82, 0x00))?.bpm).toBe(130);
    });

    it('reads the sensor-contact bits: 0b110 = detected, 0b100 = supported but not on the skin', () => {
        expect(parseHeartRate(dv(0b0000_0110, 80))?.contact).toBe('detected');
        expect(parseHeartRate(dv(0b0000_0100, 80))).toBeNull(); // not detected: the reading is refused, not displayed
    });

    it('skips the optional energy-expended field and decodes RR intervals (1/1024 s -> ms)', () => {
        // flags: uint8 value + energy present (0x08) + RR present (0x10); value 60; energy 0x0010; one RR of 1024 = 1000 ms
        const s = parseHeartRate(dv(0x18, 60, 0x10, 0x00, 0x00, 0x04));
        expect(s?.bpm).toBe(60);
        expect(s?.rrMs).toEqual([1000]);
    });

    it('never invents a value: truncated, zero or non-physiological data gives null', () => {
        expect(parseHeartRate(dv())).toBeNull();
        expect(parseHeartRate(dv(0x00))).toBeNull();
        expect(parseHeartRate(dv(0x01, 0x82))).toBeNull(); // uint16 announced, one byte present
        expect(parseHeartRate(dv(0x00, 0))).toBeNull();
        expect(parseHeartRate(dv(0x00, 255))).toBeNull();
        expect(parseHeartRate(dv(0x01, 0x2c, 0x01))).toBeNull(); // 300 bpm
    });
});

describe('other decoders', () => {
    it('battery is a percentage', () => {
        expect(parseBattery(dv(87))).toBe(87);
        expect(parseBattery(dv(101))).toBeNull();
        expect(parseBattery(dv())).toBeNull();
    });

    it('device information text', () => {
        expect(decodeText(new DataView(new TextEncoder().encode('Remax').buffer))).toBe('Remax');
        expect(decodeText(dv(0xff, 0xfe, 0xfd))).toBeNull(); // not valid text: unknown, not garbage
    });

    it('client ids are deterministic per device, type and second (re-sending cannot duplicate)', () => {
        expect(measurementClientId('abc', 'heart_rate', 1_700_000_000_400)).toBe(measurementClientId('abc', 'heart_rate', 1_700_000_000_900));
        expect(measurementClientId('abc', 'heart_rate', 1_700_000_001_000)).not.toBe(measurementClientId('abc', 'heart_rate', 1_700_000_000_000));
        expect(measurementClientId('x'.repeat(100), 'heart_rate', 0).length).toBeLessThanOrEqual(64);
    });
});

describe('error classification and environment', () => {
    const err = (name: string, message = '') => Object.assign(new Error(message), { name });

    it('maps the usual Web Bluetooth failures to clear causes', () => {
        expect(describeBleError(err('NotFoundError', 'User cancelled the requestDevice() chooser.')).problem).toBe('cancelled');
        expect(describeBleError(err('NotFoundError', 'No services matching')).problem).toBe('not_found');
        expect(describeBleError(err('NotAllowedError', 'denied')).problem).toBe('permission_denied');
        expect(describeBleError(err('SecurityError')).problem).toBe('insecure');
        expect(describeBleError(err('NetworkError', 'GATT Server is disconnected.')).problem).toBe('lost');
        expect(describeBleError(err('NotSupportedError')).problem).toBe('incompatible');
        expect(describeBleError(err('Whatever')).problem).toBe('error');
    });

    it('reports unavailable Bluetooth instead of pretending', () => {
        // jsdom has no navigator.bluetooth
        const s = webBluetoothSupport();
        expect(s.supported).toBe(false);
        expect(s.reason).toMatch(/Web Bluetooth/);
    });
});
