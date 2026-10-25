import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowDown, ArrowUp, Copy, Pencil, Play, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { ApiError, del, get, post, patch } from '@/lib/api';
import { CAT_LABEL, DAY_LABEL, EQUIP_LABEL, estimateMinutes, GOAL_LABEL, GROUP_LABEL, LEVEL_LABEL, LEVELS, suggest } from '@/lib/exercises';
import { useExerciseAccess } from '@/hooks/useExerciseAccess';
import { AccessNotice } from '@/components/ExerciseBits';
import { Badge, Button, Card, ConfirmButton, EmptyState, ErrorState, Input, Modal, PageHeader, Select, Spinner, cx, useToast } from '@/components/ui';
import type { Exercise, ExerciseAccess, Level, Program, ProgramItem } from '@/types/exercises';

const EQUIP = ['none', 'dumbbells', 'bands', 'chair', 'wall', 'gym'];
const GROUPS = ['pectoraux', 'dos', 'epaules', 'biceps_triceps', 'jambes', 'fessiers', 'corps_entier'];
const MINUTES = [5, 10, 15, 20, 30, 45, 60, 90];

interface Draft {
    id?: number;
    name: string;
    goal: Program['goal'];
    level: Level;
    minutes: number;
    equipment: string[];
    groups: string[];
    days: number[];
    items: ProgramItem[];
}

const emptyDraft = (): Draft => ({ name: '', goal: 'strength', level: 'beginner', minutes: 15, equipment: ['none'], groups: [], days: [], items: [] });

function Builder({ draft, setDraft, catalog, access, onSaved, onClose }: { draft: Draft; setDraft(d: Draft): void; catalog: Exercise[]; access: ExerciseAccess | null; onSaved(): void; onClose(): void }) {
    const toast = useToast();
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<Record<string, string[]>>({});
    const allowed = access?.allowed_categories ?? ['musculation', 'abdominaux', 'mobilite', 'general'];
    const toggle = <K extends 'equipment' | 'groups' | 'days'>(k: K, v: Draft[K][number]) => setDraft({ ...draft, [k]: (draft[k] as unknown[]).includes(v) ? (draft[k] as unknown[]).filter((x) => x !== v) : [...(draft[k] as unknown[]), v] } as Draft);
    const minutes = estimateMinutes(draft.items);
    const pool = catalog.filter((e) => allowed.includes(e.category) && !draft.items.some((i) => i.exercise_id === e.id));
    const set = (i: number, p: Partial<ProgramItem>) => setDraft({ ...draft, items: draft.items.map((it, k) => (k === i ? { ...it, ...p } : it)) });
    const move = (i: number, d: -1 | 1) => { const a = [...draft.items]; const j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; setDraft({ ...draft, items: a }); };
    const add = (id: number) => {
        const e = catalog.find((x) => x.id === id);
        if (!e) return;
        const rx = e.prescriptions[draft.level];
        setDraft({ ...draft, items: [...draft.items, { exercise_id: e.id, position: draft.items.length, sets: rx.sets, reps: rx.reps ?? null, seconds: rx.seconds ?? null, rest_seconds: rx.rest, exercise: e }] });
    };

    async function submit(ev: FormEvent) {
        ev.preventDefault();
        setBusy(true);
        setErr({});
        const body = {
            name: draft.name, goal: draft.goal, level: draft.level, target_minutes: draft.minutes, equipment: draft.equipment, muscle_groups: draft.groups, days: draft.days,
            exercises: draft.items.map((i) => ({ exercise_id: i.exercise_id, sets: i.sets, reps: i.exercise.kind === 'reps' ? i.reps : null, seconds: i.exercise.kind === 'time' ? i.seconds : null, rest_seconds: i.rest_seconds })),
        };
        try {
            if (draft.id) await patch(`/api/v1/workout-programs/${draft.id}`, body);
            else await post('/api/v1/workout-programs', body);
            toast('Programme enregistré.');
            onSaved();
        } catch (e) {
            if (e instanceof ApiError) { setErr(e.errors); toast(e.message, 'danger'); }
        } finally {
            setBusy(false);
        }
    }

    return (
        <form onSubmit={submit} className="space-y-4">
            <Input label="Nom du programme" required value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} maxLength={120} error={err.name?.[0]} />
            <div className="grid gap-3 sm:grid-cols-3">
                <Select label="Objectif" value={draft.goal} onChange={(e) => setDraft({ ...draft, goal: e.target.value as Program['goal'] })}>{Object.entries(GOAL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
                <Select label="Niveau de pratique" value={draft.level} onChange={(e) => setDraft({ ...draft, level: e.target.value as Level })}>{LEVELS.map((l) => <option key={l} value={l}>{LEVEL_LABEL[l]}</option>)}</Select>
                <Select label="Temps disponible" value={draft.minutes} onChange={(e) => setDraft({ ...draft, minutes: Number(e.target.value) })}>{MINUTES.map((m) => <option key={m} value={m}>{m} minutes</option>)}</Select>
            </div>
            <fieldset><legend className="mb-1 text-sm font-medium">Matériel disponible</legend><div className="flex flex-wrap gap-3">{EQUIP.map((k) => <label key={k} className="flex min-h-9 items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5" checked={draft.equipment.includes(k)} onChange={() => toggle('equipment', k)} /> {EQUIP_LABEL[k]}</label>)}</div></fieldset>
            {(draft.goal === 'strength' || draft.goal === 'fitness') && <fieldset><legend className="mb-1 text-sm font-medium">Groupes musculaires à travailler (facultatif)</legend><div className="flex flex-wrap gap-2">{GROUPS.map((g) => <button key={g} type="button" aria-pressed={draft.groups.includes(g)} onClick={() => toggle('groups', g)} className={cx('min-h-9 rounded-full border px-3 text-xs font-semibold', draft.groups.includes(g) ? 'border-brand-600 bg-brand-600 text-white' : 'border-sand-2 hover:bg-brand-50')}>{GROUP_LABEL[g]}</button>)}</div></fieldset>}
            <fieldset><legend className="mb-1 text-sm font-medium">Jours d'entraînement (facultatif)</legend><div className="flex flex-wrap gap-2">{[1, 2, 3, 4, 5, 6, 0].map((d) => <button key={d} type="button" aria-pressed={draft.days.includes(d)} onClick={() => toggle('days', d)} className={cx('min-h-11 min-w-11 rounded-full border px-3 text-sm font-semibold', draft.days.includes(d) ? 'border-brand-600 bg-brand-600 text-white' : 'border-sand-2 hover:bg-brand-50')}>{DAY_LABEL[d]}</button>)}</div><p className="mt-1 text-xs text-muted">Les jours servent d'aide-mémoire : aucun rappel n'est créé sans votre accord (préférences de notifications).</p></fieldset>

            <div className="rounded-2xl bg-sand p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-bold">Exercices ({draft.items.length}) · ≈ {draft.items.length ? minutes : 0} min</h3>
                    <Button type="button" variant="secondary" className="min-h-9 px-3" onClick={() => setDraft({ ...draft, items: suggest(catalog, { goal: draft.goal, level: draft.level, minutes: draft.minutes, equipment: draft.equipment, groups: draft.groups, allowed }) })}><Sparkles className="h-4 w-4" aria-hidden /> Proposer une séance</Button>
                </div>
                {draft.items.length > 0 && draft.items.length && minutes > draft.minutes * 1.25 && <p className="mt-1 text-xs text-amber-800">Cette séance dépasse le temps prévu ({draft.minutes} min). Retirez un exercice ou une série.</p>}
                {err.exercises && <p role="alert" className="mt-1 text-xs font-medium text-danger">{err.exercises[0]}</p>}
                <ol className="mt-3 space-y-2">
                    {draft.items.map((it, i) => (
                        <li key={it.exercise_id} className="rounded-2xl bg-white p-3">
                            <div className="flex items-center gap-2">
                                <img src={it.exercise.image_start} alt="" width={56} height={40} className="h-10 w-14 rounded-lg object-cover" loading="lazy" />
                                <p className="min-w-0 flex-1 text-sm font-semibold">{i + 1}. {it.exercise.name}</p>
                                <button type="button" className="grid h-9 w-9 place-items-center rounded-full hover:bg-sand" aria-label="Monter" onClick={() => move(i, -1)}><ArrowUp className="h-4 w-4" /></button>
                                <button type="button" className="grid h-9 w-9 place-items-center rounded-full hover:bg-sand" aria-label="Descendre" onClick={() => move(i, 1)}><ArrowDown className="h-4 w-4" /></button>
                                <button type="button" className="grid h-9 w-9 place-items-center rounded-full hover:bg-sand" aria-label={`Retirer ${it.exercise.name}`} onClick={() => setDraft({ ...draft, items: draft.items.filter((_, k) => k !== i) })}><X className="h-4 w-4" /></button>
                            </div>
                            <div className="mt-2 grid grid-cols-3 gap-2">
                                <label className="text-xs">Séries<input type="number" min={1} max={10} className="mt-1 block min-h-11 w-full rounded-xl border border-sand-2 px-2 text-base" value={it.sets} onChange={(e) => set(i, { sets: Number(e.target.value) })} /></label>
                                {it.exercise.kind === 'time'
                                    ? <label className="text-xs">Secondes<input type="number" min={5} max={900} className="mt-1 block min-h-11 w-full rounded-xl border border-sand-2 px-2 text-base" value={it.seconds ?? ''} onChange={(e) => set(i, { seconds: Number(e.target.value) })} /></label>
                                    : <label className="text-xs">Répétitions<input type="number" min={1} max={200} className="mt-1 block min-h-11 w-full rounded-xl border border-sand-2 px-2 text-base" value={it.reps ?? ''} onChange={(e) => set(i, { reps: Number(e.target.value) })} /></label>}
                                <label className="text-xs">Repos (s)<input type="number" min={0} max={300} className="mt-1 block min-h-11 w-full rounded-xl border border-sand-2 px-2 text-base" value={it.rest_seconds} onChange={(e) => set(i, { rest_seconds: Number(e.target.value) })} /></label>
                            </div>
                        </li>
                    ))}
                </ol>
                <div className="mt-3">
                    <Select label="Ajouter un exercice" value="" onChange={(e) => e.target.value && add(Number(e.target.value))}>
                        <option value="">Choisir…</option>
                        {(['musculation', 'general', 'abdominaux', 'mobilite'] as const).filter((c) => allowed.includes(c)).map((c) => <optgroup key={c} label={CAT_LABEL[c]}>{pool.filter((e) => e.category === c).map((e) => <option key={e.id} value={e.id}>{e.name} ({LEVEL_LABEL[e.level]})</option>)}</optgroup>)}
                    </Select>
                </div>
            </div>
            <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Annuler</Button><Button type="submit" loading={busy} disabled={!draft.items.length || !draft.name.trim()}>Enregistrer le programme</Button></div>
        </form>
    );
}

export default function Programs() {
    const nav = useNavigate();
    const toast = useToast();
    const { access } = useExerciseAccess();
    const [programs, setPrograms] = useState<Program[] | null>(null);
    const [catalog, setCatalog] = useState<Exercise[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [draft, setDraft] = useState<Draft | null>(null);

    const load = useCallback(async () => {
        try {
            setPrograms((await get<{ data: Program[] }>('/api/v1/workout-programs')).data);
            setError(null);
        } catch {
            setError('Programmes indisponibles hors ligne.');
        }
    }, []);
    useEffect(() => {
        void load();
        get<{ data: Exercise[] }>('/api/v1/exercises').then((r) => setCatalog(r.data)).catch(() => undefined);
    }, [load]);

    const mine = useMemo(() => (programs ?? []).filter((p) => !p.is_template), [programs]);
    const templates = useMemo(() => (programs ?? []).filter((p) => p.is_template), [programs]);
    const locked = (p: Program) => (access ? p.items.some((i) => !access.allowed_categories.includes(i.exercise.category)) : false);
    const edit = (p: Program) => setDraft({ id: p.id, name: p.name, goal: p.goal, level: p.level, minutes: p.target_minutes ?? 15, equipment: p.equipment ?? ['none'], groups: p.muscle_groups ?? [], days: p.days ?? [], items: p.items });

    async function duplicate(p: Program) {
        try {
            const r = await post<{ data: Program }>(`/api/v1/workout-programs/${p.id}/duplicate`);
            toast('Copie créée : vous pouvez la modifier.');
            await load();
            edit(r.data);
        } catch (e) {
            toast(e instanceof ApiError ? e.message : 'Duplication impossible.', 'danger');
        }
    }

    const Row = ({ p }: { p: Program }) => (
        <li><Card as="article" className="space-y-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div><h3 className="font-bold">{p.name}</h3><p className="text-sm text-muted">{GOAL_LABEL[p.goal]} · {LEVEL_LABEL[p.level]} · {p.items.length} exercices · ≈ {p.estimated_minutes} min{p.days?.length ? ` · ${p.days.map((d) => DAY_LABEL[d]).join(', ')}` : ''}</p></div>
                <Badge tone={p.is_template ? 'info' : 'neutral'}>{p.is_template ? 'Modèle modifiable' : 'Mon programme'}</Badge>
            </div>
            {p.description && <p className="text-sm">{p.description}</p>}
            <ol className="flex flex-wrap gap-1 text-xs text-muted">{p.items.map((i) => <li key={i.id ?? i.exercise_id} className="rounded-full bg-sand px-2 py-0.5">{i.exercise.name} · {i.sets}×{i.exercise.kind === 'time' ? `${i.seconds}s` : i.reps}</li>)}</ol>
            <div className="flex flex-wrap gap-2">
                {locked(p) ? <Badge tone="warn">Non proposé pour l'instant (prudence)</Badge> : <Button className="min-h-11" onClick={() => nav(`/app/exercises/run?program=${p.id}`)}><Play className="h-4 w-4" aria-hidden /> Démarrer ma séance</Button>}
                <Button variant="secondary" className="min-h-11" onClick={() => void duplicate(p)}><Copy className="h-4 w-4" aria-hidden /> {p.is_template ? 'Créer ma version' : 'Dupliquer'}</Button>
                {!p.is_template && <Button variant="ghost" className="min-h-11" onClick={() => edit(p)} aria-label={`Modifier ${p.name}`}><Pencil className="h-4 w-4" aria-hidden /></Button>}
                {!p.is_template && <ConfirmButton variant="ghost" className="min-h-11" aria-label={`Supprimer ${p.name}`} message="Supprimer ce programme ? Votre historique de séances est conservé." onConfirm={async () => { await del(`/api/v1/workout-programs/${p.id}`); toast('Programme supprimé.'); await load(); }}><Trash2 className="h-4 w-4" aria-hidden /></ConfirmButton>}
            </div>
        </Card></li>
    );

    return (
        <div className="space-y-5">
            <PageHeader title="Mes programmes" subtitle="Créez vos séances selon l'objectif, le niveau, le temps et le matériel. Les modèles sont modifiables (en créant votre version)." image="/images/exercises/cat-general.svg"
                action={<div className="flex flex-wrap gap-3"><Link to="/app/exercises" className="text-sm font-semibold text-brand-700 underline">← Exercices physiques</Link><Button className="min-h-11" onClick={() => setDraft(emptyDraft())}><Plus className="h-4 w-4" aria-hidden /> Créer un programme</Button></div>} />
            <AccessNotice access={access} />
            {error && <ErrorState text={error} onRetry={() => void load()} />}
            {!programs && !error && <Spinner />}
            {programs && (
                <>
                    <section aria-labelledby="mine"><h2 id="mine" className="mb-2 text-lg font-bold">Mes programmes</h2>
                        {mine.length === 0 ? <Card><EmptyState image="/images/illustrations/first-use.svg" title="Aucun programme personnel" text="Partez d'un modèle ci-dessous (« Créer ma version ») ou créez le vôtre." action={<Button onClick={() => setDraft(emptyDraft())}>Créer un programme</Button>} /></Card> : <ul className="space-y-3">{mine.map((p) => <Row key={p.id} p={p} />)}</ul>}
                    </section>
                    <section aria-labelledby="tpl"><h2 id="tpl" className="mb-2 text-lg font-bold">Modèles</h2><ul className="space-y-3">{templates.map((p) => <Row key={p.id} p={p} />)}</ul></section>
                </>
            )}
            <Modal open={draft !== null} onClose={() => setDraft(null)} title={draft?.id ? 'Modifier le programme' : 'Créer un programme'}>
                {draft && <Builder draft={draft} setDraft={setDraft} catalog={catalog} access={access} onSaved={() => { setDraft(null); void load(); }} onClose={() => setDraft(null)} />}
            </Modal>
        </div>
    );
}
