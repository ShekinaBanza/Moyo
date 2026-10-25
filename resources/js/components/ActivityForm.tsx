import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ApiError, get } from '@/lib/api';
import { ACTIVITY_CATEGORY_LABEL, fmtDateTime, fmtKcal, fmtNumber, localInputToIso, toLocalInput } from '@/lib/format';
import { fmtKm } from '@/lib/geo';
import { submitEntry } from '@/lib/offline';
import { Alert, Button, cx, Input, Rating, Select, Textarea, useToast } from '@/components/ui';
import type { ActivityCatalogItem, ActivityEntryFull, BodyMeasurement, Track } from '@/types';

let catalogCache: ActivityCatalogItem[] | null = null;

export function useActivityCatalog() {
    const [items, setItems] = useState<ActivityCatalogItem[]>(catalogCache ?? []);
    useEffect(() => {
        if (catalogCache) return;
        get<{ data: ActivityCatalogItem[] }>('/api/v1/activity-catalog').then((r) => {
            catalogCache = r.data;
            setItems(r.data);
        }).catch(() => undefined);
    }, []);
    return items;
}

export const activityIcon = (icon: string | null) => `/images/activities/${icon ?? 'other'}.svg`;

/** Illustrated, searchable activity picker. */
export function ActivityPicker({ catalog, value, onPick, compact = false }: { catalog: ActivityCatalogItem[]; value: number | null; onPick(c: ActivityCatalogItem): void; compact?: boolean }) {
    const [q, setQ] = useState('');
    const [cat, setCat] = useState('all');
    const cats = useMemo(() => [...new Set(catalog.map((c) => c.category))], [catalog]);
    const shown = catalog.filter((c) => (cat === 'all' || c.category === cat) && c.name.toLowerCase().includes(q.trim().toLowerCase()));
    return (
        <div className="space-y-3">
            {!compact && <Input label="Rechercher une activité" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ex. marche, danse, jardinage…" />}
            <div role="group" aria-label="Catégories" className="flex flex-wrap gap-2">
                {['all', ...cats].map((c) => (
                    <button key={c} type="button" aria-pressed={cat === c} onClick={() => setCat(c)} className={cx('min-h-9 rounded-full border px-3 text-xs font-semibold', cat === c ? 'border-brand-600 bg-brand-600 text-white' : 'border-sand-2 bg-white hover:bg-brand-50')}>
                        {c === 'all' ? 'Toutes' : ACTIVITY_CATEGORY_LABEL[c] ?? c}
                    </button>
                ))}
            </div>
            {shown.length === 0 ? <p className="text-sm text-muted">Aucune activité ne correspond. Choisissez « Autre activité » pour la décrire vous-même.</p> : (
                <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
                    {shown.map((c) => (
                        <li key={c.id}>
                            <button type="button" onClick={() => onPick(c)} aria-pressed={value === c.id} className={cx('flex h-full w-full flex-col items-center gap-1 rounded-2xl border p-2 text-center text-xs font-medium', value === c.id ? 'border-brand-600 bg-brand-50' : 'border-sand-2 bg-white hover:bg-brand-50')}>
                                <img src={activityIcon(c.icon)} alt="" width={56} height={56} loading="lazy" className="h-14 w-14" />
                                <span className="line-clamp-2">{c.name}</span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

interface Props {
    catalog: ActivityCatalogItem[];
    entry?: ActivityEntryFull | null;
    defaultStart?: string; // datetime-local
    presetCatalogId?: number | null;
    presetTrackId?: number | null;
    onSaved(): void;
    onUpdate?(id: number, body: Record<string, unknown>): Promise<unknown>;
    onCancel?(): void;
}

export function ActivityForm({ catalog, entry, defaultStart, presetCatalogId, presetTrackId, onSaved, onUpdate, onCancel }: Props) {
    const toast = useToast();
    const [catalogId, setCatalogId] = useState<number | null>(entry?.catalog_id ?? presetCatalogId ?? null);
    const [label, setLabel] = useState(entry?.custom_label ?? '');
    const [start, setStart] = useState(entry ? toLocalInput(new Date(entry.started_at)) : defaultStart ?? toLocalInput());
    const [dur, setDur] = useState(entry?.duration_minutes?.toString() ?? '');
    const [dist, setDist] = useState(entry?.distance_km?.toString() ?? '');
    const [effort, setEffort] = useState<number | null>(entry?.perceived_effort ?? null);
    const [weight, setWeight] = useState(entry?.weight_kg?.toString() ?? '');
    const [source, setSource] = useState<string>(entry?.source_type ?? 'manual');
    const [trackId, setTrackId] = useState<string>(entry?.track_id?.toString() ?? presetTrackId?.toString() ?? '');
    const [steps, setSteps] = useState(entry?.steps?.toString() ?? '');
    const [notes, setNotes] = useState(entry?.notes ?? '');
    const [tracks, setTracks] = useState<Track[]>([]);
    const [latestWeight, setLatestWeight] = useState<BodyMeasurement | null>(null);
    const [busy, setBusy] = useState(false);
    const [errs, setErrs] = useState<Record<string, string[]>>({});
    const [lastEstimate, setLastEstimate] = useState<ActivityEntryFull['estimate']>(null);

    useEffect(() => {
        if (presetCatalogId && !entry) setCatalogId(presetCatalogId);
    }, [presetCatalogId, entry]);

    useEffect(() => {
        get<{ data: Track[] }>('/api/v1/tracks?limit=30').then((r) => setTracks(r.data.filter((t) => t.status === 'finished' || t.status === 'interrupted'))).catch(() => undefined);
        get<{ data: BodyMeasurement[] }>('/api/v1/body-measurements?limit=100').then((r) => setLatestWeight(r.data.find((m) => m.kind === 'weight') ?? null)).catch(() => undefined);
    }, []);

    const chosen = catalog.find((c) => c.id === catalogId) ?? null;
    const linked = tracks.find((t) => String(t.id) === trackId) ?? null;

    async function submit(e: FormEvent) {
        e.preventDefault();
        if (!chosen) return;
        setBusy(true);
        setErrs({});
        const n = (v: string) => (v === '' ? null : Number(v.replace(',', '.')));
        const body: Record<string, unknown> = {
            catalog_id: chosen.id,
            custom_label: chosen.is_custom ? label : null,
            started_at: localInputToIso(start),
            duration_minutes: n(dur),
            steps: n(steps),
            perceived_effort: effort,
            weight_kg: n(weight),
            source_type: trackId ? 'gps' : source,
            notes: notes || null,
            track_id: trackId ? Number(trackId) : null,
        };
        if (!trackId) {
            body.distance_km = n(dist);
            body.distance_source = dist === '' ? null : source === 'gps' ? 'gps' : source === 'watch' ? 'watch' : 'manual';
        }
        try {
            if (entry && onUpdate) {
                const r = (await onUpdate(entry.id, body)) as ActivityEntryFull;
                setLastEstimate(r?.estimate ?? null);
                toast('Activité modifiée. Le bilan est recalculé.');
            } else {
                const r = await submitEntry<ActivityEntryFull>('/api/v1/activity-entries', body, chosen.name);
                if (r.status === 'synced') {
                    setLastEstimate(r.data.estimate);
                    toast('Activité enregistrée. Le bilan est recalculé.');
                } else toast('Hors ligne : brouillon gardé sur cet appareil, pas encore enregistré.', 'warn');
            }
            if (!entry) {
                setDur(''); setDist(''); setSteps(''); setNotes(''); setTrackId('');
            }
            onSaved();
        } catch (err) {
            if (err instanceof ApiError) setErrs(err.errors);
            toast(err instanceof ApiError ? err.message : 'Enregistrement impossible.', 'danger');
        } finally {
            setBusy(false);
        }
    }

    return (
        <form onSubmit={submit} className="space-y-4">
            {!entry && !presetCatalogId && <ActivityPicker catalog={catalog} value={catalogId} onPick={(c) => setCatalogId(c.id)} />}
            {(entry || presetCatalogId) && chosen && <p className="flex items-center gap-3 font-semibold"><img src={activityIcon(chosen.icon)} alt="" width={40} height={40} className="h-10 w-10" /> {chosen.name}</p>}

            {chosen && (
                <div className="grid gap-4 rounded-2xl bg-sand p-4 sm:grid-cols-2">
                    {chosen.is_custom && <div className="sm:col-span-2"><Input label="Nom de l'activité" required value={label} onChange={(e) => setLabel(e.target.value)} maxLength={120} error={errs.custom_label?.[0]} hint="Ex. lessive à la main, transport de seaux d'eau…" /></div>}
                    <Input label="Date et heure de début" type="datetime-local" required value={start} onChange={(e) => setStart(e.target.value)} />
                    <Input label="Durée (minutes)" type="number" min={1} max={1440} required value={dur} onChange={(e) => setDur(e.target.value)} error={errs.duration_minutes?.[0]} hint={linked ? `Trajet GPS : ${Math.max(1, Math.round(linked.duration_seconds / 60))} min si vide.` : undefined} />
                    <Rating label={chosen.is_custom ? 'Intensité ressentie (obligatoire pour estimer)' : 'Intensité ressentie (facultatif)'} max={10} value={effort} onChange={setEffort} lowText="1 = très facile" highText="10 = maximal" />
                    <div>
                        <Input label="Poids utilisé pour le calcul (kg, facultatif)" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} error={errs.weight_kg?.[0]}
                            hint={weight ? 'Valeur saisie pour cette activité.' : latestWeight ? `Sinon : dernière pesée (${fmtNumber(latestWeight.value, 'kg')}, ${fmtDateTime(latestWeight.measured_at)}).` : 'Aucune pesée enregistrée : ajoutez votre poids pour obtenir une estimation.'} />
                    </div>
                    <Select label="Association à un trajet GPS (facultatif)" value={trackId} onChange={(e) => setTrackId(e.target.value)} error={errs.track_id?.[0]}>
                        <option value="">Aucun trajet</option>
                        {tracks.map((t) => <option key={t.id} value={t.id}>{fmtDateTime(t.started_at)} · {fmtKm(t.distance_m)} ({t.status === 'finished' ? 'terminé' : 'interrompu'})</option>)}
                    </Select>
                    {trackId ? (
                        <p className="self-center text-sm">Distance : <strong>{fmtKm(linked?.distance_m)}</strong> <span className="text-muted">(source GPS, remplace toute autre distance)</span></p>
                    ) : (
                        <>
                            <Input label="Distance (km, si connue)" inputMode="decimal" value={dist} onChange={(e) => setDist(e.target.value)} error={errs.distance_km?.[0]} />
                            <Select label="Source" value={source} onChange={(e) => setSource(e.target.value)}>
                                <option value="manual">Saisie manuelle</option>
                                <option value="gps">GPS (trajet de la carte)</option>
                                <option value="watch" disabled>Appareil connecté (non disponible : protocole non vérifié)</option>
                            </Select>
                        </>
                    )}
                    <Input label="Nombre de pas (si connu)" type="number" min={0} value={steps} onChange={(e) => setSteps(e.target.value)} />
                    <div className="sm:col-span-2"><Textarea label="Notes (facultatif)" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} /></div>
                    <div className="flex flex-wrap justify-end gap-2 sm:col-span-2">
                        {onCancel && <Button type="button" variant="secondary" onClick={onCancel}>Annuler</Button>}
                        <Button type="submit" loading={busy}>{entry ? 'Enregistrer les modifications' : 'Ajouter cette activité'}</Button>
                    </div>
                    {chosen.met && <p className="text-xs text-muted sm:col-span-2">Valeur MET utilisée : {chosen.met} (moyenne de référence, non personnalisée). Dépense estimée = MET × 3,5 × poids ÷ 200 × minutes ; seule la part au-dessus du repos est ajoutée au bilan.</p>}
                </div>
            )}

            {lastEstimate && (
                <Alert tone={lastEstimate.quality === 'unavailable' ? 'warn' : 'ok'} title={lastEstimate.quality === 'unavailable' ? 'Dépense non estimable' : 'Dépense estimée de cette activité'}>
                    {lastEstimate.quality === 'unavailable'
                        ? <p>Il manque : {lastEstimate.missing.join(', ')}.</p>
                        : <p>Nette (au-dessus du repos) ≈ <strong>{fmtKcal(lastEstimate.net_kcal)}</strong> · brute ≈ {fmtKcal(lastEstimate.gross_kcal)} (information seulement). Estimation, pas une mesure.</p>}
                    {lastEstimate.assumptions.map((a) => <p key={a}>{a}</p>)}
                </Alert>
            )}
        </form>
    );
}
