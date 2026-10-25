import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Battery, Bluetooth, BluetoothOff, HeartPulse, Watch as WatchIcon } from 'lucide-react';
import { get } from '@/lib/api';
import { useWatch } from '@/hooks/useWatch';
import { inspectDevice, type DeviceReport } from '@/lib/ble';
import { PHASE_LABEL, type WatchPhase } from '@/lib/watch';
import { fmtDateTime, SOURCE_LABEL } from '@/lib/format';
import { Alert, Badge, Button, Card, EmptyState, PageHeader, Spinner, cx } from '@/components/ui';

interface Meas { id: number; value_numeric: number | null; unit: string; source_type: string; measured_at: string; received_at: string; quality_status: string; decoder_version: string | null }
interface SyncOp { id: number; status: string; accepted_count: number; duplicate_count: number; rejected_count: number; created_at: string }

const TONE: Partial<Record<WatchPhase, 'ok' | 'warn' | 'danger' | 'info' | 'neutral'>> = { connected: 'ok', synced: 'ok', reading: 'info', syncing: 'info', searching: 'info', connecting: 'info', detected: 'info', lost: 'danger', error: 'danger', incompatible: 'danger', uninterpreted: 'warn', permission_required: 'warn', unsupported: 'warn' };

export default function Watch() {
    const w = useWatch();
    const [meas, setMeas] = useState<Meas[]>([]);
    const [ops, setOps] = useState<SyncOp[]>([]);
    const [raw, setRaw] = useState<DeviceReport | null>(null);
    const [rawErr, setRawErr] = useState<string | null>(null);
    const [rawBusy, setRawBusy] = useState(false);

    useEffect(() => {
        get<{ data: Meas[] }>('/api/v1/measurements?type=heart_rate&limit=5').then((r) => setMeas(r.data)).catch(() => undefined);
        get<{ data: SyncOp[] }>('/api/v1/sync-operations').then((r) => setOps(r.data.slice(0, 5))).catch(() => undefined);
    }, [w.record?.last_sync_at, w.phase]);

    const connectedNow = ['connected', 'reading', 'syncing', 'synced', 'uninterpreted'].includes(w.phase);
    const label = connectedNow || w.phase !== 'none' ? PHASE_LABEL[w.phase] : w.record ? 'Associée, non connectée' : PHASE_LABEL.none;
    const hrConfirmed = !!w.record?.capabilities?.find((c) => c.measurement_type === 'heart_rate' && c.confirmed);
    const hasHr = w.info?.standardServices.includes('heart_rate');
    const lastSync = w.record?.last_sync_at ? fmtDateTime(w.record.last_sync_at) : 'jamais';

    async function inspect() {
        setRawBusy(true);
        setRawErr(null);
        try { setRaw(await inspectDevice(false)); } catch (e) { setRawErr(e instanceof Error ? e.message : 'Inspection impossible.'); } finally { setRawBusy(false); }
    }

    const rows: { name: string; status: string; tone: 'ok' | 'warn' | 'neutral'; note: string }[] = [
        { name: 'Fréquence cardiaque', status: hrConfirmed ? 'Lue et confirmée sur cette montre' : hasHr ? 'Disponible (pas encore lue)' : 'Pas confirmée', tone: hrConfirmed ? 'ok' : 'neutral', note: 'Profil Bluetooth standard « Heart Rate ». Valeur brute de la montre, non vérifiée médicalement.' },
        { name: 'Niveau de batterie', status: w.info?.battery != null ? `${w.info.battery} %` : w.info?.standardServices.includes('battery') ? 'Service présent, valeur illisible' : 'Non exposé', tone: w.info?.battery != null ? 'ok' : 'neutral', note: 'Affiché seulement, jamais enregistré comme donnée de santé.' },
        { name: 'Informations de l\'appareil', status: w.info?.model || w.info?.firmware || w.info?.manufacturer ? [w.info?.manufacturer, w.info?.model, w.info?.firmware].filter(Boolean).join(' · ') : 'Non lues', tone: w.info?.model ? 'ok' : 'neutral', note: 'Fabricant, modèle, micrologiciel (textes standard).' },
        { name: 'Pas, distance, calories', status: 'Non pris en charge', tone: 'warn', note: "Protocole propriétaire non documenté : aucune valeur n'est lue ni estimée. Saisie manuelle ou GPS." },
        { name: 'Sommeil, SpO₂, HRV', status: 'Non pris en charge', tone: 'warn', note: "Idem : non décodé. Moyo n'affiche jamais de phases de sommeil ni de valeurs que la montre n'a pas réellement fournies." },
    ];

    return (
        <div className="space-y-5">
            <PageHeader title="Ma montre" subtitle="Facultative : tout Moyo fonctionne sans elle. Connectez-la seulement si vous le souhaitez." image="/images/illustrations/watch.svg" />

            <Card aria-labelledby="state" className="space-y-4">
                <div className="flex items-start gap-3">
                    <span className={cx('grid h-12 w-12 shrink-0 place-items-center rounded-2xl', connectedNow ? 'bg-brand-600 text-white' : 'bg-sand-2 text-ink')}>{connectedNow ? <Bluetooth className="h-6 w-6" aria-hidden /> : <BluetoothOff className="h-6 w-6" aria-hidden />}</span>
                    <div className="min-w-0">
                        <h2 id="state" className="text-lg font-bold">{w.info?.name ?? w.record?.name ?? 'Remax Watch8'}</h2>
                        <p className="mt-1" aria-live="polite"><Badge tone={TONE[w.phase] ?? 'neutral'}>{label}</Badge></p>
                        <p className="mt-1 text-sm text-muted">Dernière synchronisation réussie : {lastSync}{w.info?.battery != null ? ` · batterie ${w.info.battery} %` : ''}</p>
                    </div>
                </div>

                {w.problem && <Alert tone="danger" title="Problème de connexion"><p>{w.problem}</p></Alert>}
                {w.notice && <Alert tone="info"><p>{w.notice}</p></Alert>}
                {!w.support.supported && <Alert tone="warn" title="Indisponible sur ce navigateur"><p>{w.support.reason}</p><p>Vous pouvez continuer sans montre : repas, sommeil, activités, GPS et bilan fonctionnent normalement.</p></Alert>}
                {w.phase === 'uninterpreted' && <Alert tone="warn" title="Données reçues mais pas encore interprétées"><p>La montre est connectée et expose des services propriétaires (listés ci-dessous), mais leur format n'est pas documenté : Moyo ne les interprète pas et n'affiche aucune valeur à partir d'eux.</p></Alert>}
                {w.phase === 'incompatible' && <Alert tone="danger" title="Appareil incompatible"><p>Cet appareil n'expose aucun service lisible par Moyo. Vous pouvez essayer « Afficher tous les appareils » pour choisir un autre appareil.</p></Alert>}

                <div className="flex flex-wrap gap-3">
                    {!connectedNow && w.phase !== 'searching' && w.phase !== 'connecting' && w.support.supported && (
                        w.phase === 'lost' && w.hasBtDevice()
                            ? <Button className="min-h-12" onClick={() => void w.reconnect()}><Bluetooth className="h-4 w-4" aria-hidden /> Reconnecter</Button>
                            : <Button className="min-h-12" onClick={() => void w.connect(false)}><Bluetooth className="h-4 w-4" aria-hidden /> Connecter ma montre</Button>
                    )}
                    {(w.phase === 'searching' || w.phase === 'connecting' || w.phase === 'detected') && <Button loading disabled className="min-h-12">{PHASE_LABEL[w.phase]}</Button>}
                    {w.support.supported && !connectedNow && <Button variant="secondary" className="min-h-12" onClick={() => void w.connect(true)}>Afficher tous les appareils Bluetooth</Button>}
                    {connectedNow && hasHr && w.phase !== 'reading' && w.phase !== 'syncing' && <Button className="min-h-12" onClick={() => void w.measureHeartRate(30)}><HeartPulse className="h-4 w-4" aria-hidden /> Mesurer ma fréquence cardiaque (30 s)</Button>}
                    {w.phase === 'reading' && <Button variant="secondary" className="min-h-12" onClick={w.stopMeasure}>Arrêter la lecture</Button>}
                    {connectedNow && <Button variant="secondary" className="min-h-12" onClick={() => void w.disconnect()}>Déconnecter</Button>}
                    <Link to="/app" className="inline-flex min-h-12 items-center rounded-full border border-brand-200 bg-white px-5 text-sm font-semibold text-brand-700">Continuer sans montre</Link>
                </div>
                <p className="text-xs text-muted">Le navigateur vous demande l'autorisation Bluetooth au moment où vous touchez « Connecter ma montre » (Chrome ou Edge, HTTPS). Aucune connexion permanente en arrière-plan : la connexion dure tant que cette page reste ouverte.</p>

                {(w.phase === 'reading' || w.samples.length > 0) && (
                    <div className="rounded-2xl bg-brand-50 p-4" aria-live="polite">
                        <p className="text-sm font-semibold">Valeurs reçues en direct ({w.samples.length})</p>
                        {w.samples.length === 0 ? <p className="text-sm text-muted">En attente de la première valeur de la montre…</p> : <p className="mt-1 text-4xl font-extrabold text-brand-900">{w.samples[w.samples.length - 1].bpm} <span className="text-base font-normal text-muted">bpm (valeur brute, non vérifiée)</span></p>}
                    </div>
                )}
            </Card>

            {w.loaded && !w.record && w.phase === 'none' && (
                <Card><EmptyState image="/images/illustrations/watch.svg" title="Aucune montre associée" text="Pas de problème : saisissez vos données à la main, ou connectez une montre compatible quand vous voulez." action={<div className="flex flex-wrap justify-center gap-2"><Link to="/app/day" className="inline-flex min-h-11 items-center rounded-full bg-brand-600 px-5 text-sm font-semibold text-white">Continuer manuellement</Link></div>} /></Card>
            )}
            {!w.loaded && <Spinner />}

            <Card aria-labelledby="caps">
                <h2 id="caps" className="mb-1 font-bold">Types de données pris en charge</h2>
                <p className="mb-3 text-sm text-muted">Un type n'est « confirmé » qu'après avoir été réellement lu sur votre montre. Rien n'est supposé.</p>
                <ul className="divide-y divide-sand-2">
                    {rows.map((r) => <li key={r.name} className="py-3"><p className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold">{r.name}</span><Badge tone={r.tone}>{r.status}</Badge></p><p className="mt-1 text-xs text-muted">{r.note}</p></li>)}
                </ul>
                {w.info && (w.info.customServices.length > 0 || w.info.otherServices.length > 0) && <p className="mt-3 break-all text-xs text-muted">Services propriétaires détectés (non interprétés) : {[...w.info.customServices, ...w.info.otherServices].join(', ')}</p>}
            </Card>

            <Card aria-labelledby="last">
                <h2 id="last" className="mb-2 font-bold">Dernières mesures de la montre</h2>
                {meas.filter((m) => m.source_type === 'watch').length === 0 ? <p className="text-sm text-muted">Aucune mesure reçue d'une montre. Les valeurs apparaîtront ici avec leur source, leur date de mesure et leur date de réception.</p> : (
                    <ul className="divide-y divide-sand-2 text-sm">{meas.filter((m) => m.source_type === 'watch').map((m) => <li key={m.id} className="py-2"><p className="font-semibold">{m.value_numeric} {m.unit} <span className="font-normal text-muted">· {SOURCE_LABEL[m.source_type]}</span></p><p className="text-xs text-muted">Mesurée le {fmtDateTime(m.measured_at)} · reçue le {fmtDateTime(m.received_at)} · <Badge tone={m.quality_status === 'unverified' ? 'warn' : 'neutral'}>{m.quality_status === 'unverified' ? 'non vérifiée' : m.quality_status}</Badge>{m.decoder_version ? ` · décodeur ${m.decoder_version}` : ''}</p></li>)}</ul>
                )}
                {ops.length > 0 && <div className="mt-3 border-t border-sand-2 pt-3"><p className="mb-1 text-sm font-semibold">Historique des synchronisations</p><ul className="text-xs text-muted">{ops.map((o) => <li key={o.id}>{fmtDateTime(o.created_at)} · {o.status} · {o.accepted_count} reçues, {o.duplicate_count} déjà connues, {o.rejected_count} rejetées</li>)}</ul></div>}
                <p className="mt-3 text-xs text-muted">Une mesure de montre n'est ni exacte ni validée médicalement, et ne remplace jamais un symptôme que vous déclarez. Les calories de la montre ne sont pas utilisées dans le bilan énergétique.</p>
            </Card>

            <Card aria-labelledby="help">
                <h2 id="help" className="mb-2 font-bold">Dépannage</h2>
                <ul className="list-disc space-y-1 pl-5 text-sm">
                    <li>Utilisez Chrome ou Edge (Android ou ordinateur) ; Safari/iPhone ne prend pas en charge Web Bluetooth.</li>
                    <li>Activez le Bluetooth (et la localisation sur Android), allumez la montre et approchez-la.</li>
                    <li>Fermez l'application officielle de la montre : une montre ne parle souvent qu'à un appareil à la fois.</li>
                    <li>Si l'autorisation a été refusée, réautorisez le site dans les réglages du navigateur.</li>
                    <li>Si la montre n'apparaît pas, essayez « Afficher tous les appareils Bluetooth ».</li>
                </ul>
                {w.record && <div className="mt-3"><Button variant="ghost" className="min-h-11" onClick={() => void w.forget()}>Dissocier cette montre de mon compte</Button></div>}
            </Card>

            <details className="rounded-3xl bg-white p-5 shadow-soft">
                <summary className="cursor-pointer font-bold">Inspection avancée (lecture seule, pour documenter le protocole)</summary>
                <p className="mt-2 text-sm text-muted">Liste les services et caractéristiques que la montre expose, sans rien écrire ni décoder. Sert à compléter docs/WATCH_BLE.md.</p>
                {w.support.supported && <div className="mt-3"><Button variant="secondary" loading={rawBusy} onClick={() => void inspect()}>Inspecter une montre</Button></div>}
                {rawErr && <div className="mt-3"><Alert tone="danger">{rawErr}</Alert></div>}
                {raw && <ul className="mt-3 space-y-2 text-xs">{raw.services.map((s) => <li key={s.uuid} className="rounded-xl bg-sand p-3"><p className="break-all font-mono">{s.uuid}</p><ul className="mt-1 text-muted">{s.characteristics.map((c) => <li key={c.uuid} className="break-all">{c.uuid} — {c.properties.join(', ') || 'aucune propriété'}</li>)}</ul></li>)}</ul>}
            </details>
            <p className="flex items-center gap-2 text-xs text-muted"><Battery className="h-3.5 w-3.5" aria-hidden /><WatchIcon className="h-3.5 w-3.5" aria-hidden /> Intégration matérielle à valider sur une vraie Remax Watch8 : voir docs/WATCH_BLE.md.</p>
        </div>
    );
}
