import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BellRing, CheckCheck, Settings, Trash2 } from 'lucide-react';
import { del, get, post } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';
import { Alert, Badge, Button, Card, EmptyState, ErrorState, PageHeader, Spinner, cx } from '@/components/ui';
import { emitNotificationsChanged } from '@/hooks/useUnread';
import type { AppNotification } from '@/types';

export default function Notifications() {
    const nav = useNavigate();
    const [items, setItems] = useState<AppNotification[] | null>(null);
    const [unread, setUnread] = useState(0);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            const r = await get<{ data: AppNotification[]; unread: number }>('/api/v1/notifications');
            setItems(r.data);
            setUnread(r.unread);
            setError(null);
            emitNotificationsChanged();
        } catch {
            setError('Notifications indisponibles hors ligne.');
        }
    }, []);
    useEffect(() => {
        void load();
    }, [load]);

    async function open(n: AppNotification) {
        if (!n.read_at) await post(`/api/v1/notifications/${n.id}/read`).catch(() => undefined);
        emitNotificationsChanged();
        if (n.link) nav(n.link);
        else void load();
    }

    return (
        <div className="space-y-5">
            <PageHeader title="Notifications" subtitle="Vos rappels de suivi. Ce ne sont jamais des alertes médicales ni un service d'urgence." image="/images/illustrations/habits.svg"
                action={<Link to="/app/notifications/settings" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 underline"><Settings className="h-4 w-4" aria-hidden /> Choisir mes rappels</Link>} />

            {error && <ErrorState text={error} onRetry={() => void load()} />}
            {!items && !error && <Spinner />}
            {items && (
                <Card aria-labelledby="notifs">
                    <div className="mb-3 flex items-center justify-between gap-2">
                        <h2 id="notifs" className="font-bold">{unread > 0 ? `${unread} non lue(s)` : 'Tout est lu'}</h2>
                        {unread > 0 && <Button variant="secondary" className="min-h-9 px-3" onClick={async () => { await post('/api/v1/notifications/read-all'); await load(); }}><CheckCheck className="h-4 w-4" aria-hidden /> Tout marquer comme lu</Button>}
                    </div>
                    {items.length === 0 ? (
                        <EmptyState image="/images/illustrations/empty.svg" title="Aucune notification" text="Activez les rappels qui vous aident (repas, sommeil, activités…). Vous êtes libre de n'en choisir aucun."
                            action={<Link to="/app/notifications/settings" className="inline-flex min-h-11 items-center rounded-full bg-brand-600 px-5 text-sm font-semibold text-white">Choisir mes rappels</Link>} />
                    ) : (
                        <ul className="divide-y divide-sand-2">
                            {items.map((n) => (
                                <li key={n.id} className="flex items-start gap-2 py-3">
                                    <button type="button" onClick={() => void open(n)} className="flex min-w-0 flex-1 items-start gap-3 text-left">
                                        <span className={cx('mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full', n.read_at ? 'bg-slate-100 text-slate-500' : 'bg-brand-600 text-white')}><BellRing className="h-4 w-4" aria-hidden /></span>
                                        <span className="min-w-0">
                                            <span className={cx('block', n.read_at ? 'font-medium' : 'font-bold')}>{n.title} {!n.read_at && <Badge tone="info">Nouveau</Badge>}</span>
                                            {n.body && <span className="block text-sm text-muted">{n.body}</span>}
                                            <span className="block text-xs text-muted">{fmtDateTime(n.created_at)}{n.push_status === 'sent' ? ' · aussi envoyée au navigateur' : n.push_status === 'failed' ? " · envoi navigateur échoué" : ''}</span>
                                        </span>
                                    </button>
                                    <Button variant="ghost" className="px-3" aria-label="Supprimer cette notification" onClick={async () => { await del(`/api/v1/notifications/${n.id}`); await load(); }}><Trash2 className="h-4 w-4" aria-hidden /></Button>
                                </li>
                            ))}
                        </ul>
                    )}
                </Card>
            )}
            <Alert tone="info">En cas d'essoufflement important au repos, de douleur thoracique ou d'évanouissement, ne comptez pas sur une notification : cherchez immédiatement une aide médicale.</Alert>
        </div>
    );
}
