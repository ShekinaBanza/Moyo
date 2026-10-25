import { CloudOff } from 'lucide-react';
import { Alert, Button } from '@/components/ui';
import { discardOutboxItem, flushOutbox, retryOutboxItem, type OutboxItem } from '@/lib/offline';
import { fmtDateTime } from '@/lib/format';

/** Entries stored on this device and not yet confirmed by the server. */
export function OutboxPanel({ items }: { items: OutboxItem[] }) {
    if (!items.length) return null;
    return (
        <div className="mb-4 space-y-2">
            {items.map((i) => (
                <Alert key={i.clientId} tone={i.state === 'pending' ? 'warn' : 'danger'} title={i.state === 'pending' ? 'En attente de synchronisation' : i.state === 'conflict' ? 'Refusé par le serveur' : 'Échec de synchronisation'}>
                    <p className="flex items-center gap-2">
                        <CloudOff className="h-4 w-4" aria-hidden /> {i.label} — noté le {fmtDateTime(i.createdLocalAt)}
                    </p>
                    {i.error && <p>{i.error}</p>}
                    <p className="text-xs">Cette entrée n'est pas encore enregistrée sur le serveur.</p>
                    <div className="mt-2 flex gap-2">
                        {i.state === 'pending' ? (
                            <Button variant="secondary" className="min-h-9 px-3" onClick={() => void flushOutbox()}>Réessayer maintenant</Button>
                        ) : (
                            <Button variant="secondary" className="min-h-9 px-3" onClick={() => void retryOutboxItem(i).then(flushOutbox)}>Réessayer</Button>
                        )}
                        <Button variant="ghost" className="min-h-9 px-3" onClick={() => void discardOutboxItem(i.clientId)}>Supprimer le brouillon</Button>
                    </div>
                </Alert>
            ))}
        </div>
    );
}
