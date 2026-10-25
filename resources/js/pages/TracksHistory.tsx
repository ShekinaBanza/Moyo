import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { ApiError, del, get } from '@/lib/api';
import { fmtDateTime, toLocalInput, TRACK_STATUS_LABEL } from '@/lib/format';
import { fmtClock, fmtKm, fmtPace } from '@/lib/geo';
import { Alert, Badge, Button, Card, ConfirmButton, EmptyState, ErrorState, Modal, PageHeader, Spinner, useToast } from '@/components/ui';
import { ActivityForm, useActivityCatalog } from '@/components/ActivityForm';
import type { Track, TrackPoint } from '@/types';
import type { LatLng } from '@/components/MapView';

const MapView = lazy(() => import('@/components/MapView'));

const asDate = (s: string) => new Date(s.includes('T') || s.endsWith('Z') ? s : s.replace(' ', 'T') + 'Z');

export default function TracksHistory() {
    const toast = useToast();
    const catalog = useActivityCatalog();
    const [tracks, setTracks] = useState<Track[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [sel, setSel] = useState<Track | null>(null);
    const [segments, setSegments] = useState<LatLng[][]>([]);
    const [assoc, setAssoc] = useState<Track | null>(null);

    const load = useCallback(async () => {
        try {
            setTracks((await get<{ data: Track[] }>('/api/v1/tracks?limit=100')).data);
            setError(null);
        } catch {
            setError('Historique indisponible (hors ligne ?).');
        }
    }, []);
    useEffect(() => {
        void load();
    }, [load]);

    async function open(t: Track) {
        setSel(t);
        setSegments([]);
        try {
            const r = await get<{ points: TrackPoint[] }>(`/api/v1/tracks/${t.id}`);
            const by = new Map<number, LatLng[]>();
            r.points.filter((p) => p.accuracy_m === null || p.accuracy_m <= 50).forEach((p) => by.set(p.segment, [...(by.get(p.segment) ?? []), [p.lat, p.lng]]));
            setSegments([...by.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v));
        } catch {
            toast('Tracé indisponible hors ligne.', 'warn');
        }
    }

    async function remove(id: number) {
        await del(`/api/v1/tracks/${id}`);
        if (sel?.id === id) setSel(null);
        toast('Trajet supprimé.');
        await load();
    }

    async function removeAll() {
        try {
            const r = await del<{ deleted: number }>('/api/v1/tracks');
            toast(`${r.deleted} trajet(s) supprimé(s).`);
            setSel(null);
            await load();
        } catch (e) {
            toast(e instanceof ApiError ? e.message : 'Suppression impossible.', 'danger');
        }
    }

    return (
        <div className="space-y-5">
            <PageHeader title="Historique des trajets" subtitle="Vos trajets GPS, leur distance et leur état. Supprimez-les quand vous voulez." image="/images/illustrations/activity.svg"
                action={<Link to="/app/map" className="text-sm font-semibold text-brand-700 underline">← Carte et déplacements</Link>} />
            {error && <ErrorState text={error} onRetry={() => void load()} />}
            {!tracks && !error && <Spinner />}
            {tracks && tracks.length === 0 && <Card><EmptyState image="/images/illustrations/empty.svg" title="Aucun trajet enregistré" text="Démarrez un trajet depuis la carte : la distance est calculée à partir des positions reçues." action={<Link to="/app/map" className="inline-flex min-h-11 items-center rounded-full bg-brand-600 px-5 text-sm font-semibold text-white">Ouvrir la carte</Link>} /></Card>}

            {tracks && tracks.length > 0 && (
                <Card aria-labelledby="list">
                    <div className="mb-3 flex items-center justify-between gap-2">
                        <h2 id="list" className="font-bold">{tracks.length} trajet(s)</h2>
                        <ConfirmButton variant="ghost" message="Supprimer tout l'historique des trajets GPS ? Les distances déjà copiées dans vos activités sont conservées." onConfirm={removeAll}>Tout supprimer</ConfirmButton>
                    </div>
                    <ul className="divide-y divide-sand-2">
                        {tracks.map((t) => (
                            <li key={t.id} className="py-3">
                                <div className="flex items-start justify-between gap-3">
                                    <button type="button" className="min-w-0 text-left" onClick={() => void open(t)}>
                                        <p className="font-semibold">{fmtKm(t.distance_m)} <span className="font-normal text-muted">· {fmtDateTime(t.started_at)}</span></p>
                                        <p className="text-sm text-muted">Durée {fmtClock(t.duration_seconds)} · {t.points_count} points{t.gap_count ? ` · ${t.gap_count} perte(s) de signal` : ''}{t.avg_accuracy_m !== null ? ` · précision moy. ± ${Math.round(t.avg_accuracy_m)} m` : ''}</p>
                                        <p className="mt-1 flex flex-wrap gap-2"><Badge tone={t.status === 'finished' ? 'ok' : t.status === 'interrupted' ? 'warn' : 'info'}>{TRACK_STATUS_LABEL[t.status]}</Badge>{t.status === 'interrupted' && <span className="text-xs text-muted">{t.end_reason === 'stale' ? 'Suivi arrêté sans clôture (page fermée, téléphone éteint ou suspendu)' : t.end_reason === 'permission_lost' ? 'Autorisation de localisation retirée' : 'Interrompu'}</span>}</p>
                                    </button>
                                    <ConfirmButton variant="ghost" className="px-3" aria-label="Supprimer ce trajet" message="Supprimer ce trajet et ses positions GPS ?" onConfirm={() => remove(t.id)}><Trash2 className="h-4 w-4" aria-hidden /></ConfirmButton>
                                </div>
                            </li>
                        ))}
                    </ul>
                </Card>
            )}

            <Modal open={sel !== null} onClose={() => setSel(null)} title="Détail du trajet">
                {sel && (
                    <div className="space-y-3">
                        <Suspense fallback={<Spinner />}><MapView segments={segments} className="h-64" label={`Tracé du trajet du ${fmtDateTime(sel.started_at)}`} /></Suspense>
                        <dl className="grid grid-cols-2 gap-2 text-sm">
                            <div><dt className="text-muted">Distance</dt><dd className="font-semibold">{fmtKm(sel.distance_m)}</dd></div>
                            <div><dt className="text-muted">Durée en mouvement</dt><dd className="font-semibold">{fmtClock(sel.duration_seconds)}</dd></div>
                            <div><dt className="text-muted">Début</dt><dd className="font-semibold">{fmtDateTime(sel.started_at)}</dd></div>
                            <div><dt className="text-muted">Fin</dt><dd className="font-semibold">{sel.ended_at ? fmtDateTime(asDate(sel.ended_at as string).toISOString()) : 'en cours'}</dd></div>
                            <div><dt className="text-muted">Allure moyenne</dt><dd className="font-semibold">{fmtPace(sel.distance_m, sel.duration_seconds) ?? 'Non disponible'}</dd></div>
                            <div><dt className="text-muted">Points écartés</dt><dd className="font-semibold">{sel.rejected_points}</dd></div>
                        </dl>
                        {(sel.status === 'finished' || sel.status === 'interrupted') && <Button onClick={() => { setAssoc(sel); setSel(null); }}>Associer à une activité</Button>}
                        <Alert tone="info">Un déplacement n'est pas forcément une marche : associez-le à l'activité réelle pour qu'il compte dans votre bilan.</Alert>
                    </div>
                )}
            </Modal>

            <Modal open={assoc !== null} onClose={() => setAssoc(null)} title="Associer ce trajet à une activité">
                {assoc && (
                    <div className="space-y-2">
                        <p className="text-sm text-muted">Trajet de {fmtKm(assoc.distance_m)} : la distance GPS remplacera toute autre distance de l'activité.</p>
                        <ActivityForm catalog={catalog} presetCatalogId={catalog.find((c) => c.slug === 'marche-normale')?.id ?? null} presetTrackId={assoc.id} defaultStart={toLocalInput(new Date(assoc.started_at))} onSaved={() => { setAssoc(null); toast('Trajet associé. Le bilan est recalculé.'); }} onCancel={() => setAssoc(null)} />
                    </div>
                )}
            </Modal>
        </div>
    );
}
