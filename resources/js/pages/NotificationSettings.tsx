import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, get, patch, post } from '@/lib/api';
import { currentSubscription, disablePush, enablePush, pushSupport, showLocalTest } from '@/lib/push';
import { Alert, Button, Card, ErrorState, PageHeader, Spinner, useToast } from '@/components/ui';
import type { NotifPref, NotifPrefsPayload } from '@/types';

const DAYS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const ZONES = ['Africa/Kinshasa', 'Africa/Lubumbashi', 'Africa/Nairobi', 'Africa/Johannesburg', 'Europe/Paris', 'Europe/Brussels', 'UTC'];

export default function NotificationSettings() {
    const toast = useToast();
    const [p, setP] = useState<NotifPrefsPayload | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [subscribed, setSubscribed] = useState(false);
    const [perm, setPerm] = useState<NotificationPermission | 'unsupported'>('unsupported');
    const [busy, setBusy] = useState(false);
    const [testMsg, setTestMsg] = useState<string | null>(null);
    const support = pushSupport();

    const load = useCallback(async () => {
        try {
            setP((await get<{ data: NotifPrefsPayload }>('/api/v1/notification-preferences')).data);
            setError(null);
        } catch {
            setError('Préférences indisponibles hors ligne.');
        }
        setSubscribed(!!(await currentSubscription().catch(() => null)));
        setPerm('Notification' in window ? Notification.permission : 'unsupported');
    }, []);
    useEffect(() => {
        void load();
    }, [load]);

    async function save(body: Record<string, unknown>) {
        try {
            setP((await patch<{ data: NotifPrefsPayload }>('/api/v1/notification-preferences', body)).data);
        } catch (e) {
            toast(e instanceof ApiError ? e.message : 'Enregistrement impossible.', 'danger');
        }
    }
    const savePref = (kind: string, change: Partial<NotifPref>) => save({ preferences: [{ kind, ...change }] });

    async function activate() {
        if (!p?.push.public_key) return;
        setBusy(true);
        try {
            const r = await enablePush(p.push.public_key);
            toast(r === 'granted' ? 'Notifications du navigateur activées sur cet appareil.' : 'Autorisation non accordée : les notifications dans l\'application restent actives.', r === 'granted' ? 'ok' : 'warn');
        } catch (e) {
            toast(e instanceof ApiError ? e.message : 'Activation impossible.', 'danger');
        } finally {
            setBusy(false);
            await load();
        }
    }

    async function test() {
        setTestMsg(null);
        try {
            if (p?.push.server_configured && subscribed) {
                setTestMsg((await post<{ message: string }>('/api/v1/push-subscriptions/test')).message);
            } else {
                await showLocalTest();
                setTestMsg("Test local affiché sur cet appareil. Il ne prouve pas que le serveur peut envoyer des notifications.");
            }
        } catch (e) {
            setTestMsg(e instanceof Error ? e.message : 'Test impossible.');
        }
    }

    if (error && !p) return <ErrorState text={error} onRetry={() => void load()} />;
    if (!p) return <Spinner />;

    return (
        <div className="space-y-5">
            <PageHeader title="Préférences de notifications" subtitle="Vous choisissez chaque rappel. Rien n'est activé par défaut." image="/images/illustrations/habits.svg" action={<Link to="/app/notifications" className="text-sm font-semibold text-brand-700 underline">← Centre de notifications</Link>} />

            <Card>
                <label className="flex min-h-11 items-center justify-between gap-3 font-semibold">
                    Recevoir mes rappels dans l'application
                    <input type="checkbox" className="h-6 w-6" checked={p.enabled} onChange={(e) => void save({ enabled: e.target.checked })} />
                </label>
                <p className="mt-1 text-sm text-muted">Interrupteur général : désactivé, plus aucun rappel n'est créé, quels que soient les réglages ci-dessous.</p>
                <div className="mt-3 max-w-xs">
                    <label htmlFor="tz" className="mb-1 block text-sm font-medium">Fuseau horaire des rappels</label>
                    <select id="tz" className="min-h-11 w-full rounded-xl border border-sand-2 bg-white px-3" value={p.timezone} onChange={(e) => void save({ timezone: e.target.value })}>
                        {[...new Set([p.timezone, ...ZONES])].map((z) => <option key={z}>{z}</option>)}
                    </select>
                </div>
            </Card>

            <Card aria-labelledby="list">
                <h2 id="list" className="mb-1 text-lg font-bold">Mes rappels</h2>
                <p className="mb-4 text-sm text-muted">Un rappel n'apparaît que s'il est dû et que l'action n'est pas déjà faite (ex. pas de rappel du déjeuner si vous l'avez déjà noté). Un seul rappel par jour et par type.</p>
                <ul className="divide-y divide-sand-2">
                    {p.preferences.map((x) => (
                        <li key={x.kind} className="py-3">
                            <label className="flex min-h-11 items-start justify-between gap-3">
                                <span><span className="block font-semibold">{x.label}</span><span className="block text-sm text-muted">{x.description}</span></span>
                                <input type="checkbox" className="mt-1 h-6 w-6 shrink-0" checked={x.enabled} onChange={(e) => void savePref(x.kind, { enabled: e.target.checked })} aria-label={`Activer le rappel : ${x.label}`} />
                            </label>
                            {x.enabled && x.timed && (
                                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                                    <label className="text-sm">Heure<input type="time" className="mt-1 block min-h-11 w-full rounded-xl border border-sand-2 px-3" value={x.time_of_day} onChange={(e) => e.target.value && void savePref(x.kind, { time_of_day: e.target.value })} /></label>
                                    <label className="text-sm">Fréquence
                                        <select className="mt-1 block min-h-11 w-full rounded-xl border border-sand-2 bg-white px-3" value={x.frequency} onChange={(e) => void savePref(x.kind, { frequency: e.target.value as NotifPref['frequency'], ...(e.target.value === 'weekly' && x.weekday === null ? { weekday: 0 } : {}) })}>
                                            <option value="daily">Tous les jours</option><option value="weekdays">Jours ouvrés</option><option value="weekly">Une fois par semaine</option>
                                        </select>
                                    </label>
                                    {x.frequency === 'weekly' && (
                                        <label className="text-sm">Jour
                                            <select className="mt-1 block min-h-11 w-full rounded-xl border border-sand-2 bg-white px-3" value={x.weekday ?? 0} onChange={(e) => void savePref(x.kind, { weekday: Number(e.target.value) })}>{DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}</select>
                                        </label>
                                    )}
                                </div>
                            )}
                            {x.enabled && !x.timed && <p className="mt-1 text-xs text-muted">{x.kind === 'track_check' ? "Se déclenche quand un trajet reste ouvert sans nouvelle position pendant 10 minutes." : "Évalué sur cet appareil : le bandeau « saisies en attente » s'affiche tant que des brouillons attendent le serveur."}</p>}
                        </li>
                    ))}
                </ul>
            </Card>

            <Card aria-labelledby="push">
                <h2 id="push" className="mb-2 text-lg font-bold">Notifications du navigateur (facultatif)</h2>
                <p className="mb-3 text-sm">Elles affichent un rappel même quand Moyo n'est pas ouverte. Elles dépendent de votre navigateur, de votre téléphone (économie de batterie, mode ne pas déranger) et de la configuration du serveur : elles ne sont <strong>jamais garanties</strong>, et ne constituent pas un service d'urgence.</p>
                {!support.supported && <Alert tone="info">{support.reason}</Alert>}
                {support.supported && !p.push.server_configured && <Alert tone="info" title="Envoi push non configuré"><p>Ce serveur n'a pas (encore) de clés d'envoi. Les rappels dans l'application fonctionnent ; les notifications du navigateur ne sont pas disponibles. (Administrateur : voir docs/NOTIFICATIONS.md.)</p></Alert>}
                {support.supported && p.push.server_configured && (
                    <div className="space-y-3">
                        <p className="text-sm text-muted">État : {subscribed ? 'activées sur cet appareil' : perm === 'denied' ? 'bloquées par le navigateur (à réautoriser dans ses réglages)' : 'non activées'}.</p>
                        {perm === 'denied' && <Alert tone="warn">L'autorisation a été refusée. Moyo ne peut pas la redemander : modifiez les réglages du site dans votre navigateur.</Alert>}
                        <div className="flex flex-wrap gap-3">
                            {!subscribed ? <Button onClick={() => void activate()} loading={busy} disabled={perm === 'denied'}>Activer sur cet appareil</Button> : <Button variant="secondary" onClick={async () => { await disablePush(); toast('Notifications du navigateur désactivées sur cet appareil.'); await load(); }}>Désactiver sur cet appareil</Button>}
                            <Button variant="secondary" onClick={() => void test()} disabled={!subscribed && perm !== 'granted'}>Tester</Button>
                        </div>
                    </div>
                )}
                {testMsg && <div className="mt-3"><Alert tone="info">{testMsg}</Alert></div>}
                <p className="mt-4 text-xs text-muted">Rappels et fermeture du navigateur : sans notification push, les rappels se créent à l'ouverture de l'application (ou toutes les 5 minutes si le serveur a une tâche planifiée) et sont visibles dans le centre de notifications.</p>
            </Card>
        </div>
    );
}
