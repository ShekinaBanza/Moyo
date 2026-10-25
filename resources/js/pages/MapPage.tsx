import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Pause, Play, Square, Navigation, WifiOff } from 'lucide-react';
import { ApiError, get, post } from '@/lib/api';
import { fmtClock, fmtKm, fmtPace } from '@/lib/geo';
import { fmtDateTime, TRACK_STATUS_LABEL } from '@/lib/format';
import { useTrackRecorder } from '@/hooks/useTrackRecorder';
import { Alert, Badge, Button, Card, Modal, PageHeader, Spinner } from '@/components/ui';
import type { Track } from '@/types';

const MapView = lazy(() => import('@/components/MapView'));

export default function MapPage() {
    const [consent, setConsent] = useState<boolean | null>(null);
    const [askConsent, setAskConsent] = useState(false);
    const [online, setOnline] = useState(navigator.onLine);
    const [recent, setRecent] = useState<Track[]>([]);
    const [openTrack, setOpenTrack] = useState<Track | null>(null);

    const loadTracks = useCallback(async () => {
        try {
            const r = await get<{ data: Track[] }>('/api/v1/tracks?limit=5');
            setRecent(r.data);
            setOpenTrack(r.data.find((t) => t.status === 'recording' || t.status === 'paused') ?? null);
        } catch {
            /* offline: keep what is displayed */
        }
    }, []);
    const rec = useTrackRecorder(() => void loadTracks());

    useEffect(() => {
        get<{ data: { purpose: string; granted: boolean }[] }>('/api/v1/consents').then((r) => setConsent(!!r.data.find((c) => c.purpose === 'gps_tracking')?.granted)).catch(() => setConsent(null));
        void loadTracks();
        const up = () => setOnline(true);
        const down = () => setOnline(false);
        window.addEventListener('online', up);
        window.addEventListener('offline', down);
        return () => {
            window.removeEventListener('online', up);
            window.removeEventListener('offline', down);
        };
    }, [loadTracks]);

    // A track left open (page reloaded / closed): offer to continue instead of silently recording.
    useEffect(() => {
        if (rec.state === 'idle' && openTrack) void rec.attach(openTrack);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [openTrack]);

    async function begin() {
        if (!consent) {
            setAskConsent(true);
            return;
        }
        try {
            await rec.start();
        } catch (e) {
            if (e instanceof ApiError && e.status === 403) setAskConsent(true);
        }
    }

    async function accept() {
        await post('/api/v1/consents', { purpose: 'gps_tracking', granted: true });
        setConsent(true);
        setAskConsent(false);
        await rec.start().catch(() => undefined);
    }

    const active = rec.state === 'recording' || rec.state === 'paused' || rec.state === 'detached' || rec.state === 'stopping';
    const pace = fmtPace(rec.stats.distanceM, rec.stats.durationS);
    const warnings = Object.values(rec.warnings);

    return (
        <div className="space-y-5">
            <PageHeader title="Carte et déplacements" subtitle="Mesurez la distance d'un trajet à partir de votre position GPS. Rien n'est enregistré tant que vous ne démarrez pas un trajet." image="/images/illustrations/activity.svg"
                action={<Link to="/app/map/history" className="text-sm font-semibold text-brand-700 underline">Historique des trajets</Link>} />

            {!online && <Alert tone="warn" title="Hors ligne"><p>Le fond de carte nécessite Internet. Les positions déjà enregistrées restent tracées et seront envoyées au retour du réseau. Pour commencer un nouveau trajet, une connexion est nécessaire.</p></Alert>}
            {rec.error && <Alert tone="danger" title="Suivi GPS">{rec.error}</Alert>}
            {warnings.map((w) => <Alert key={w} tone="warn">{w}</Alert>)}

            <Card className="space-y-4">
                <Suspense fallback={<Spinner label="Chargement de la carte…" />}>
                    <MapView segments={rec.segments} position={rec.position} accuracy={rec.accuracy} follow={rec.state === 'recording'} label="Carte du trajet en cours" className="h-80 sm:h-96" />
                </Suspense>

                <dl className="grid grid-cols-3 gap-2 text-center" aria-live="polite">
                    <div className="rounded-2xl bg-brand-50 p-3"><dt className="text-xs text-muted">Distance</dt><dd className="text-xl font-extrabold text-brand-900">{active || rec.points.length ? fmtKm(rec.stats.distanceM) : '—'}</dd></div>
                    <div className="rounded-2xl bg-brand-50 p-3"><dt className="text-xs text-muted">Durée</dt><dd className="text-xl font-extrabold text-brand-900">{active || rec.points.length ? fmtClock(rec.elapsed) : '—'}</dd></div>
                    <div className="rounded-2xl bg-brand-50 p-3"><dt className="text-xs text-muted">Allure moy.</dt><dd className="text-sm font-extrabold text-brand-900">{pace ?? 'Non disponible'}</dd></div>
                </dl>
                {active && <p className="text-xs text-muted">Début : {rec.track ? fmtDateTime(rec.track.started_at) : '—'} · position : {rec.accuracy !== null ? `± ${Math.round(rec.accuracy)} m` : 'en attente'} · {rec.stats.accepted} points retenus, {rec.stats.rejected} écartés. Estimation en direct : la distance officielle est recalculée par le serveur à la fin.</p>}

                <div className="flex flex-wrap gap-3">
                    {rec.state === 'idle' && <Button onClick={() => void begin()} className="min-h-12 flex-1 sm:flex-none"><Navigation className="h-4 w-4" aria-hidden /> Commencer un trajet</Button>}
                    {rec.state === 'starting' && <Button loading disabled>Recherche de la position…</Button>}
                    {rec.state === 'recording' && <><Button variant="secondary" onClick={() => void rec.pause()}><Pause className="h-4 w-4" aria-hidden /> Mettre en pause</Button><Button variant="danger" onClick={() => void rec.finish(false)}><Square className="h-4 w-4" aria-hidden /> Terminer le trajet</Button></>}
                    {rec.state === 'paused' && <><Button onClick={() => void rec.resume()}><Play className="h-4 w-4" aria-hidden /> Reprendre</Button><Button variant="danger" onClick={() => void rec.finish(false)}><Square className="h-4 w-4" aria-hidden /> Terminer le trajet</Button></>}
                    {rec.state === 'detached' && (
                        <div className="w-full space-y-3">
                            <Alert tone="warn" title="Un trajet est resté ouvert"><p>Le suivi sur cet appareil s'est arrêté (page fermée, rechargée ou suspendue). La distance parcourue pendant l'interruption n'est pas connue. Vous pouvez reprendre le suivi (un nouveau segment démarre, sans ligne droite sur la période manquante) ou clôturer le trajet comme interrompu.</p></Alert>
                            <div className="flex flex-wrap gap-3"><Button onClick={() => void rec.continueHere()}><Play className="h-4 w-4" aria-hidden /> Reprendre le suivi</Button><Button variant="secondary" onClick={() => void rec.finish(true)}>Clôturer (interrompu)</Button></div>
                        </div>
                    )}
                    {rec.state === 'stopping' && <Button loading disabled>Clôture…</Button>}
                </div>
                {rec.state === 'idle' && rec.track && rec.track.status !== 'recording' && (
                    <Alert tone="ok" title={rec.track.status === 'finished' ? 'Trajet terminé' : 'Trajet interrompu'}>
                        <p>{fmtKm(rec.track.distance_m)} en {fmtClock(rec.track.duration_seconds)}. <Link className="font-semibold underline" to="/app/map/history">Associer ce trajet à une activité</Link> pour l'inclure dans votre bilan.</p>
                    </Alert>
                )}
            </Card>

            <Card aria-labelledby="priv">
                <h2 id="priv" className="mb-2 font-bold">Vie privée et limites du suivi</h2>
                <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
                    <li>Votre position n'est demandée qu'au moment où vous touchez « Commencer un trajet », et lue uniquement pendant le trajet. Elle n'est jamais partagée.</li>
                    <li>Les points GPS sont gardés 90 jours puis supprimés (le résumé distance/durée reste). Vous pouvez supprimer un trajet ou tout l'historique à tout moment.</li>
                    <li>Une application web ne peut pas garantir le suivi écran éteint ou en arrière-plan : gardez l'écran allumé et l'application ouverte. Si le suivi est interrompu, un message s'affiche et la distance manquante n'est pas inventée.</li>
                    <li>La distance GPS mesure un déplacement, pas une activité : un trajet en véhicule est aussi une distance. Vous décidez ensuite de l'associer (ou non) à « marche », « course », etc.</li>
                    <li>Le fond de carte (OpenStreetMap) nécessite Internet.</li>
                </ul>
                {consent && <button className="mt-3 text-sm font-semibold text-brand-700 underline" onClick={async () => { await post('/api/v1/consents', { purpose: 'gps_tracking', granted: false }); setConsent(false); }}>Retirer mon consentement au suivi GPS</button>}
            </Card>

            {recent.length > 0 && (
                <Card aria-labelledby="rec">
                    <h2 id="rec" className="mb-2 font-bold">Derniers trajets</h2>
                    <ul className="divide-y divide-sand-2 text-sm">{recent.map((t) => <li key={t.id} className="flex justify-between gap-2 py-2"><span>{fmtDateTime(t.started_at)}</span><span className="flex items-center gap-2"><strong>{fmtKm(t.distance_m)}</strong><Badge tone={t.status === 'finished' ? 'ok' : 'warn'}>{TRACK_STATUS_LABEL[t.status]}</Badge></span></li>)}</ul>
                </Card>
            )}

            <Modal open={askConsent} onClose={() => setAskConsent(false)} title="Enregistrer des trajets GPS ?">
                <div className="space-y-3 text-sm">
                    <p>Pour mesurer un trajet, Moyo enregistre votre position pendant que vous l'avez démarré, puis calcule la distance. Les coordonnées sont des données personnelles sensibles : elles restent liées à votre compte, ne sont jamais partagées et vous pouvez les supprimer à tout moment.</p>
                    <p className="flex items-start gap-2 text-muted"><WifiOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> Le navigateur vous demandera ensuite l'autorisation de localisation.</p>
                    <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setAskConsent(false)}>Non merci</Button><Button onClick={() => void accept()}>J'accepte et je commence</Button></div>
                </div>
            </Modal>
        </div>
    );
}
