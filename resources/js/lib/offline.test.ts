import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushOutbox, listOutbox, purgeOutbox, submitEntry } from './offline';

const jsonResponse = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('offline outbox', () => {
    beforeEach(async () => {
        await purgeOutbox();
        document.cookie = 'XSRF-TOKEN=test';
    });
    afterEach(() => vi.restoreAllMocks());

    it('stores a draft with a stable client id when the network is down and does not call it synced', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
        const res = await submitEntry('/api/v1/food-entries', { name: 'Riz' }, 'Riz');
        expect(res.status).toBe('queued');
        const items = await listOutbox();
        expect(items).toHaveLength(1);
        expect(items[0].body.client_id).toBe((res as { clientId: string }).clientId);
        expect(items[0].state).toBe('pending');
    });

    it('removes a draft only after the server confirms it, and retries reuse the same client id', async () => {
        const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError('offline'));
        vi.stubGlobal('fetch', fetchMock);
        await submitEntry('/api/v1/symptoms', { symptom_type: 'fatigue' }, 'Fatigue');
        const [draft] = await listOutbox();

        // still offline: nothing is removed
        fetchMock.mockRejectedValue(new TypeError('offline'));
        await flushOutbox();
        expect(await listOutbox()).toHaveLength(1);

        // back online: the server answer arrives, the draft is removed, and the SAME client_id is sent
        fetchMock.mockImplementation(async (url: string) => (String(url).includes('csrf') ? new Response(null, { status: 204 }) : jsonResponse(201, { data: { id: 1 } })));
        const out = await flushOutbox();
        expect(out.synced).toBe(1);
        expect(await listOutbox()).toHaveLength(0);
        const posted = fetchMock.mock.calls.filter((c) => String(c[0]).includes('/api/v1/symptoms')).at(-1)!;
        expect(JSON.parse(posted[1].body).client_id).toBe(draft.clientId);
    });

    it('keeps a draft as conflict when the server rejects it (422) instead of silently dropping it', async () => {
        const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError('offline'));
        vi.stubGlobal('fetch', fetchMock);
        await submitEntry('/api/v1/body-measurements', { kind: 'weight', value: 900 }, 'Poids');
        fetchMock.mockImplementation(async (url: string) => (String(url).includes('csrf') ? new Response(null, { status: 204 }) : jsonResponse(422, { message: 'invalide', errors: { value: ['invalide'] } })));
        await flushOutbox();
        const [item] = await listOutbox();
        expect(item.state).toBe('conflict');
    });

    it('purge removes every private draft (logout / account deletion)', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
        await submitEntry('/api/v1/food-entries', { name: 'A' }, 'A');
        await purgeOutbox();
        expect(await listOutbox()).toHaveLength(0);
    });
});
