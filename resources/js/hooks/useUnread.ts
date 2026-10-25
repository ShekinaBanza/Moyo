import { useEffect, useState } from 'react';
import { get } from '@/lib/api';

const EVENT = 'moyo:notifications-changed';
export const emitNotificationsChanged = () => window.dispatchEvent(new Event(EVENT));

/** Unread count for the bell. Polls gently (every 2 min, only while the tab is visible). */
export function useUnread(): number {
    const [n, setN] = useState(0);
    useEffect(() => {
        let alive = true;
        const read = () => {
            if (document.visibilityState !== 'visible') return;
            get<{ unread: number }>('/api/v1/notifications/unread-count').then((r) => alive && setN(r.unread)).catch(() => undefined);
        };
        read();
        const t = setInterval(read, 120_000);
        window.addEventListener(EVENT, read);
        document.addEventListener('visibilitychange', read);
        return () => {
            alive = false;
            clearInterval(t);
            window.removeEventListener(EVENT, read);
            document.removeEventListener('visibilitychange', read);
        };
    }, []);
    return n;
}
