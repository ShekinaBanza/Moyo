import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Activity, Apple, Bed, BellRing, ChevronLeft, ChevronRight, HeartPulse, MapPinned, Ruler, Sunrise } from 'lucide-react';
import { get, NetworkError } from '@/lib/api';
import { fmtDuration, fmtKcal, fmtNumber, fmtSigned, localDate, MEAL_LABEL, NA, SYMPTOM_LABEL, toLocalInput } from '@/lib/format';
import { fmtClock, fmtKm } from '@/lib/geo';
import { Alert, Badge, Button, Card, EmptyState, ErrorState, Input, Modal, PageHeader, Spinner, cx } from '@/components/ui';
import { ActivityForm, activityIcon, useActivityCatalog } from '@/components/ActivityForm';
import type { DayData, TimelineItem } from '@/types';

const QUICK = ['marche-normale', 'marche-rapide', 'course', 'danse', 'travaux-menagers', 'jardinage', 'travail-assis', 'autre'];

const ICON: Record<TimelineItem['type'], typeof Bed> = { wake: Sunrise, sleep: Bed, meal: Apple, activity: Activity, track: MapPinned, measurement: Ruler, symptom: HeartPulse, reminder: BellRing };

function describe(i: TimelineItem): string {
    const d = (i.detail ?? {}) as Record<string, number | string | boolean | null>;
    switch (i.type) {
        case 'sleep': return `${fmtDuration(d.sleep_minutes as number)} de sommeil (au lit ${fmtDuration(d.time_in_bed_minutes as number)})`;
        case 'meal': return `${MEAL_LABEL[d.meal_type as string] ?? ''}${d.kcal != null ? ` · ≈ ${d.kcal} kcal (${d.nutrition_status === 'verified' ? 'vérifiée' : 'estimée'})` : ' · calories inconnues'}`;
        case 'activity': return `${d.minutes ? fmtDuration(d.minutes as number) : 'durée inconnue'}${d.distance_km != null ? ` · ${fmtNumber(d.distance_km as number, 'km')} (${d.distance_source === 'gps' ? 'GPS' : 'saisie'})` : ''}${d.net_kcal != null ? ` · ≈ ${fmtKcal(d.net_kcal as number)} nettes` : ' · dépense non estimable'}`;
        case 'track': return `${fmtKm(d.distance_m as number)} · ${fmtClock(d.duration_seconds as number)} · ${d.status === 'finished' ? 'terminé' : d.status === 'interrupted' ? 'interrompu' : 'en cours'}${d.linked_to_activity ? ' · associé à une activité' : ' · non associé : un déplacement n\'est pas forcément une marche'}`;
        case 'measurement': return `${d.value} ${d.unit}`;
        case 'symptom': return `${SYMPTOM_LABEL[d.symptom_type as string] ?? ''} · intensité ${d.intensity}/10`;
        case 'reminder': return d.status === 'done' ? 'Fait' : 'En attente';
        default: return '';
    }
}

const SOURCE_TXT = (i: TimelineItem) => (i.type === 'reminder' ? 'Rappel' : i.detected ? (i.source === 'gps' ? 'Détecté par GPS' : i.source === 'watch' ? 'Appareil connecté' : 'Importé') : 'Déclaré (saisie manuelle)');

export default function Day() {
    const [params, setParams] = useSearchParams();
    const date = params.get('date') ?? localDate();
    const [d, setD] = useState<DayData | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [pick, setPick] = useState<string | null>(null);
    const catalog = useActivityCatalog();

    const load = useCallback(async () => {
        setD(null);
        setError(null);
        try {
            setD((await get<{ data: DayData }>(`/api/v1/day?date=${date}`)).data);
        } catch (e) {
            setError(e instanceof NetworkError ? 'Vous êtes hors ligne : la chronologie est calculée par le serveur.' : 'Chargement impossible.');
        }
    }, [date]);
    useEffect(() => {
        void load();
    }, [load]);

    const setDate = (v: string) => setParams(v === localDate() ? {} : { date: v });
    const shift = (n: number) => {
        const x = new Date(date + 'T12:00:00');
        x.setDate(x.getDate() + n);
        setDate(localDate(x));
    };
    const quickItems = QUICK.map((s) => catalog.find((c) => c.slug === s)).filter((c): c is NonNullable<typeof c> => !!c);
    const chosen = catalog.find((c) => c.slug === pick) ?? null;
    const startAt = date === localDate() ? toLocalInput() : `${date}T08:00`;

    return (
        <div className="space-y-5">
            <PageHeader title="Ma journée" subtitle="Tout ce que vous avez fait, dans l'ordre. Les saisies manuelles et les données détectées restent distinctes." image="/images/illustrations/habits.svg" />

            <div className="flex items-end gap-2">
                <Button variant="secondary" aria-label="Jour précédent" onClick={() => shift(-1)}><ChevronLeft className="h-4 w-4" /></Button>
                <div className="flex-1"><Input label="Date" type="date" max={localDate()} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} /></div>
                <Button variant="secondary" aria-label="Jour suivant" disabled={date >= localDate()} onClick={() => shift(1)}><ChevronRight className="h-4 w-4" /></Button>
            </div>

            <Card aria-labelledby="quick">
                <h2 id="quick" className="mb-1 font-bold">Ajouter rapidement</h2>
                <p className="mb-3 text-sm text-muted">Touchez une activité pour l'ajouter à cette journée.</p>
                <ul className="grid grid-cols-4 gap-2 sm:grid-cols-8">
                    {quickItems.map((c) => (
                        <li key={c.id}><button type="button" onClick={() => setPick(c.slug)} className="flex w-full flex-col items-center gap-1 rounded-2xl border border-sand-2 bg-white p-2 text-center text-[11px] font-medium hover:bg-brand-50"><img src={activityIcon(c.icon)} alt="" width={48} height={48} loading="lazy" className="h-12 w-12" /><span className="line-clamp-2">{c.name.replace(/ \(.*\)/, '')}</span></button></li>
                    ))}
                </ul>
                <div className="mt-3 flex flex-wrap gap-2 text-sm font-semibold">
                    <Link to="/app/food" className="inline-flex min-h-11 items-center rounded-full border border-brand-200 bg-white px-4 text-brand-700">+ Repas</Link>
                    <Link to="/app/sleep" className="inline-flex min-h-11 items-center rounded-full border border-brand-200 bg-white px-4 text-brand-700">+ Sommeil</Link>
                    <Link to="/app/map" className="inline-flex min-h-11 items-center rounded-full border border-brand-200 bg-white px-4 text-brand-700">+ Trajet GPS</Link>
                    <Link to="/app/symptoms" className="inline-flex min-h-11 items-center rounded-full border border-brand-200 bg-white px-4 text-brand-700">+ Symptôme</Link>
                </div>
            </Card>

            {error && <ErrorState text={error} onRetry={() => void load()} />}
            {!d && !error && <Spinner />}

            {d && (
                <>
                    <Card aria-labelledby="tl">
                        <h2 id="tl" className="mb-3 font-bold">Chronologie</h2>
                        {d.timeline.length === 0 ? (
                            <EmptyState image="/images/illustrations/first-use.svg" title="Rien d'enregistré ce jour-là" text="Ajoutez une activité ci-dessus, un repas ou votre sommeil pour construire votre journée." />
                        ) : (
                            <ol className="relative space-y-4 border-l-2 border-brand-100 pl-5">
                                {d.timeline.map((i) => {
                                    const Icon = ICON[i.type];
                                    return (
                                        <li key={`${i.type}-${i.id}-${i.at}`} className="relative">
                                            <span className={cx('absolute -left-[31px] grid h-6 w-6 place-items-center rounded-full text-white', i.detected ? 'bg-sky-600' : 'bg-brand-600')}><Icon className="h-3.5 w-3.5" aria-hidden /></span>
                                            <p className="text-xs text-muted">{new Date(i.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</p>
                                            <p className="font-semibold">{i.link ? <Link to={i.link} className="hover:underline">{i.title}</Link> : i.title}</p>
                                            <p className="text-sm text-muted">{describe(i)}</p>
                                            <p className="mt-1"><Badge tone={i.detected ? 'info' : 'neutral'}>{SOURCE_TXT(i)}</Badge></p>
                                        </li>
                                    );
                                })}
                            </ol>
                        )}
                    </Card>

                    <Card aria-labelledby="recap">
                        <h2 id="recap" className="mb-3 font-bold">Récapitulatif de la journée</h2>
                        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                            <div><dt className="text-muted">Aliments et boissons</dt><dd className="font-semibold">{d.recap.foods.length ? d.recap.foods.map((f) => f.name).join(', ') : NA}</dd></div>
                            <div><dt className="text-muted">Activités déclarées</dt><dd className="font-semibold">{d.recap.activities}</dd></div>
                            <div><dt className="text-muted">Durée totale d'activité</dt><dd className="font-semibold">{fmtDuration(d.recap.activity_minutes)}</dd></div>
                            <div><dt className="text-muted">Distance des activités</dt><dd className="font-semibold">{d.recap.distance_declared_km !== null ? fmtNumber(d.recap.distance_declared_km, 'km') : NA}</dd></div>
                            <div><dt className="text-muted">Trajets GPS non associés</dt><dd className="font-semibold">{d.recap.distance_gps_unassigned_km !== null ? fmtNumber(d.recap.distance_gps_unassigned_km, 'km') : NA}</dd></div>
                            <div><dt className="text-muted">Calories consommées estimées</dt><dd className="font-semibold">{fmtKcal(d.recap.consumed_kcal)}</dd></div>
                            <div><dt className="text-muted">Calories dépensées estimées</dt><dd className="font-semibold">{fmtKcal(d.recap.expenditure_kcal)}</dd></div>
                            <div><dt className="text-muted">Bilan énergétique estimé</dt><dd className="font-semibold">{fmtSigned(d.recap.balance_kcal)}</dd></div>
                        </dl>
                        {d.recap.missing.length > 0 && <div className="mt-4"><Alert tone="info" title="Données manquantes"><p>{d.recap.missing.join(' · ')}</p></Alert></div>}
                        {d.recap.balance_caveats.length > 0 && <p className="mt-3 text-xs text-muted">{d.recap.balance_caveats.join(' ')}</p>}
                        <p className="mt-4 text-sm"><Link to={`/app/energy?date=${date}`} className="font-semibold text-brand-700 underline">Ouvrir le bilan énergétique détaillé</Link></p>
                    </Card>
                </>
            )}

            <Modal open={chosen !== null} onClose={() => setPick(null)} title={chosen ? `Ajouter : ${chosen.name}` : ''}>
                {chosen && <ActivityForm catalog={catalog} presetCatalogId={chosen.id} defaultStart={startAt} onSaved={() => { setPick(null); void load(); }} onCancel={() => setPick(null)} />}
            </Modal>
        </div>
    );
}
