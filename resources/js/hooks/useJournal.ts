import { useCallback, useEffect, useState } from 'react';
import { ApiError, del, get, NetworkError, patch } from '@/lib/api';
import { submitEntry, onOutboxChange, listOutbox, type OutboxItem } from '@/lib/offline';

/** Generic list + create (offline-capable) + delete for a journal endpoint. */
export function useJournal<T extends { id: number }>(endpoint: string, query = 'limit=200') {
    const [items, setItems] = useState<T[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [pending, setPending] = useState<OutboxItem[]>([]);

    const load = useCallback(async () => {
        setError(null);
        try {
            setItems((await get<{ data: T[] }>(`/api/v1/${endpoint}?${query}`)).data);
        } catch (e) {
            setError(e instanceof NetworkError ? "Vous êtes hors ligne : l'historique ne peut pas être chargé." : e instanceof ApiError ? e.message : 'Chargement impossible.');
        } finally {
            setLoading(false);
        }
    }, [endpoint, query]);

    const loadPending = useCallback(async () => {
        const all = await listOutbox().catch(() => []);
        setPending(all.filter((i) => i.url.includes(`/api/v1/${endpoint}`)));
    }, [endpoint]);

    useEffect(() => {
        void load();
        void loadPending();
        return onOutboxChange(() => {
            void load();
            void loadPending();
        });
    }, [load, loadPending]);

    const create = useCallback(
        async (body: Record<string, unknown>, label: string) => {
            const res = await submitEntry<T>(`/api/v1/${endpoint}`, body, label);
            await load();
            await loadPending();
            return res;
        },
        [endpoint, load, loadPending],
    );

    const update = useCallback(
        async (id: number, body: Record<string, unknown>) => {
            const res = await patch<{ data: T }>(`/api/v1/${endpoint}/${id}`, body);
            await load();
            return res.data;
        },
        [endpoint, load],
    );

    const remove = useCallback(
        async (id: number) => {
            await del(`/api/v1/${endpoint}/${id}`);
            await load();
        },
        [endpoint, load],
    );

    return { items, loading, error, pending, create, update, remove, reload: load };
}
