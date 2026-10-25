/*
 * Offline outbox. Drafts of health entries are kept in IndexedDB until the SERVER confirms them.
 * Privacy limits (documented in docs/OFFLINE.md): IndexedDB is not encrypted; anyone with access to the
 * unlocked browser profile can read pending drafts. The outbox is purged on logout and account deletion.
 */
import { ApiError, NetworkError, post } from './api';

export type OutboxState = 'pending' | 'failed' | 'conflict';

export interface OutboxItem {
    clientId: string;
    url: string;
    body: Record<string, unknown>;
    label: string;
    createdLocalAt: string;
    state: OutboxState;
    error?: string;
    attempts: number;
}

const DB = 'moyo-outbox';
const STORE = 'items';

function open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'clientId' });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await open();
    return new Promise((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const r = fn(t.objectStore(STORE));
        t.oncomplete = () => {
            db.close();
            resolve(r.result);
        };
        t.onerror = () => reject(t.error);
    });
}

export const newClientId = () => crypto.randomUUID();
export const listOutbox = () => tx<OutboxItem[]>('readonly', (s) => s.getAll());
const putItem = (i: OutboxItem) => tx('readwrite', (s) => s.put(i));
const removeItem = (id: string) => tx('readwrite', (s) => s.delete(id));
export const purgeOutbox = () => tx('readwrite', (s) => s.clear());

type Listener = () => void;
const listeners = new Set<Listener>();
export const onOutboxChange = (l: Listener) => {
    listeners.add(l);
    return () => {
        listeners.delete(l);
    };
};
const notify = () => listeners.forEach((l) => l());

export type SubmitResult<T> = { status: 'synced'; data: T } | { status: 'queued'; clientId: string };

/**
 * Sends a creation to the server. If the network is unavailable the draft is stored locally and
 * `queued` is returned: it is NOT considered saved until `flushOutbox` receives the server answer.
 * Validation errors (HTTP 4xx) are thrown so the user can fix the form.
 */
export async function submitEntry<T>(url: string, body: Record<string, unknown>, label: string): Promise<SubmitResult<T>> {
    const clientId = (body.client_id as string) ?? newClientId();
    const payload = { ...body, client_id: clientId };
    try {
        const res = await post<{ data: T }>(url, payload);
        return { status: 'synced', data: res.data };
    } catch (e) {
        if (e instanceof NetworkError) {
            await putItem({ clientId, url, body: payload, label, createdLocalAt: new Date().toISOString(), state: 'pending', attempts: 0 });
            notify();
            return { status: 'queued', clientId };
        }
        throw e;
    }
}

let flushing = false;

/** Retries every pending draft. Safe to call repeatedly: the server dedupes on client_id. */
export async function flushOutbox(): Promise<{ synced: number; failed: number }> {
    if (flushing) return { synced: 0, failed: 0 };
    flushing = true;
    let synced = 0;
    let failed = 0;
    try {
        for (const item of await listOutbox()) {
            if (item.state === 'conflict') continue;
            try {
                await post(item.url, item.body);
                await removeItem(item.clientId); // removed only after server confirmation
                synced++;
            } catch (e) {
                if (e instanceof NetworkError) break; // still offline: keep everything
                if (e instanceof ApiError && e.status === 401) break; // logged out: keep drafts, retry after login
                failed++;
                const state: OutboxState = e instanceof ApiError && e.status === 422 ? 'conflict' : 'failed';
                await putItem({ ...item, state, attempts: item.attempts + 1, error: e instanceof ApiError ? e.message : 'Erreur inconnue' });
            }
        }
    } finally {
        flushing = false;
        notify();
    }
    return { synced, failed };
}

export async function discardOutboxItem(clientId: string) {
    await removeItem(clientId);
    notify();
}

export async function retryOutboxItem(item: OutboxItem) {
    await putItem({ ...item, state: 'pending' });
    notify();
}
