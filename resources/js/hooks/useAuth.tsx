import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { ApiError, get, post } from '@/lib/api';
import { flushOutbox, purgeOutbox } from '@/lib/offline';
import type { Me } from '@/types';

interface AuthState {
    user: Me | null;
    loading: boolean;
    login(email: string, password: string): Promise<void>;
    register(data: Record<string, unknown>): Promise<void>;
    /** false when the server could not be reached: the server session is then still open. */
    logout(): Promise<boolean>;
    refresh(): Promise<void>;
    afterAccountDeleted(): Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

async function purgeLocalPrivateData() {
    await purgeOutbox().catch(() => undefined);
    const reg = await navigator.serviceWorker?.getRegistration?.();
    reg?.active?.postMessage('purge');
}

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<Me | null>(null);
    const [loading, setLoading] = useState(true);

    const refresh = useCallback(async () => {
        try {
            setUser((await get<{ data: Me }>('/api/v1/me')).data);
        } catch (e) {
            if (e instanceof ApiError && e.status === 401) setUser(null);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    // After a successful login, retry drafts written while offline.
    useEffect(() => {
        if (user) void flushOutbox();
        const onOnline = () => void flushOutbox();
        window.addEventListener('online', onOnline);
        return () => window.removeEventListener('online', onOnline);
    }, [user]);

    const value: AuthState = {
        user,
        loading,
        refresh,
        async login(email, password) {
            await post('/api/v1/auth/login', { email, password });
            await refresh();
        },
        async register(data) {
            await post('/api/v1/auth/register', data);
            await refresh();
        },
        async logout() {
            const serverClosed = await post('/api/v1/auth/logout').then(() => true, () => false);
            await purgeLocalPrivateData(); // never leave one user's drafts on a shared device
            setUser(null);
            return serverClosed;
        },
        async afterAccountDeleted() {
            await purgeLocalPrivateData();
            setUser(null);
        },
    };

    return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
    const v = useContext(Ctx);
    if (!v) throw new Error('useAuth outside AuthProvider');
    return v;
}
