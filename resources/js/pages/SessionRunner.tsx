import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Minus, OctagonX, Pause, Play, Plus, SkipForward, Wind } from 'lucide-react';
import { ApiError, get, post } from '@/lib/api';
import { submitEntry } from '@/lib/offline';
import { fmtKcal } from '@/lib/format';
import { fmtClock } from '@/lib/geo';
import { CAT_LABEL, estimateMinutes } from '@/lib/exercises';
import { currentStep, doneSets, initRun, plannedSets, reduce, remainingSeconds, stepElapsedMs, totalActiveSeconds, type Action, type RunItem } from '@/lib/workoutRunner';
import { useExerciseAccess } from '@/hooks/useExerciseAccess';
import { AccessNotice, ExImage } from '@/components/ExerciseBits';
import { Alert, Badge, Button, Card, ErrorState, Modal, Rating, Spinner, Textarea, cx, useToast } from '@/components/ui';
import type { Exercise, ExCategory, Program, WorkoutSession } from '@/types/exercises';

interface Prepared { name: string; programId: number | null; items: (RunItem & { category: ExCategory })[] }
interface Conflict { id: number; name: string; source_type: string; started_at: string; duration_minutes: number | null }

export default function SessionRunner() {
    const [params] = useSearchParams();
    const location = useLocation() as { state?: { name: string; items: (RunItem & { category: ExCategory })[] } };
    const toast = useToast();
    const { access } = useExerciseAccess();
    const [catalog, setCatalog] = useState<Record<number, Exercise>>({});
    const [prep, setPrep] = useState<Prepared | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        get<{ data: Exercise[] }>('/api/v1/exercises').then((r) => setCatalog(Object.fromEntries(r.data.map((e) => [e.id, e])))).catch(() => setError('Catalogue indisponible hors ligne.'));
        const pid = params.get('program');
        if (pid) {
            get<{ data: Program }>(`/api/v1/workout-programs/${pid}`).then((r) => setPrep({
                name: r.data.name, programId: r.data.id,
                items: r.data.items.map((i) => ({ exerciseId: i.exercise_id, name: i.exercise.name, kind: i.exercise.kind, sets: i.sets, reps: i.reps, seconds: i.seconds, rest: i.rest_seconds, category: i.exercise.category })),
            })).catch(() => setError('Programme introuvable ou hors ligne.'));
        } else if (location.state?.items) setPrep({ name: location.state.name, programId: null, items: location.state.items });
        else setError("Aucune séance sélectionnée. Choisissez un programme ou un exercice.");
    }, [params, location.state]);

    if (error) return <ErrorState text={error} />;
    if (!prep || !access) return <Spinner />;
    return <Runner prep={prep} catalog={catalog} access={access} toast={toast} />;
}

function Runner({ prep, catalog, access, toast }: { prep: Prepared; catalog: Record<number, Exercise>; access: NonNullable<ReturnType<typeof useExerciseAccess>['access']>; toast: ReturnType<typeof useToast> }) {
    const [items, setItems] = useState(prep.items);
    const [state, dispatch] = useReducer(reduce, undefined, () => initRun(prep.items));
    const [now, setNow] = useState(Date.now());
    const [reps, setReps] = useState<number | null>(null);
    const [difficulty, setDifficulty] = useState<number | null>(null);
    const [notes, setNotes] = useState('');
    const [saved, setSaved] = useState<{ session: WorkoutSession; queued: boolean } | null>(null);
    const [saving, setSaving] = useState(false);
    const [conflicts, setConflicts] = useState<Conflict[] | null>(null);
    const [logged, setLogged] = useState<string | null>(null);
    const wake = useRef<{ release(): Promise<void> } | null>(null);

    const blocked = access.mode === 'blocked' || items.some((i) => !access.allowed_categories.includes(i.category));
    const step = currentStep(state);
    const it = step ? state.items[step.ex] : null;
    const ex = it ? catalog[it.exerciseId] : null;

    // Real timers: derived from timestamps, refreshed 4 times per second.
    useEffect(() => {
        if (state.status !== 'running') return;
        const t = setInterval(() => { const n = Date.now(); setNow(n); dispatch({ t: 'tick', now: n }); }, 250);
        return () => clearInterval(t);
    }, [state.status]);

    useEffect(() => {
        if (state.status === 'running' || state.status === 'paused') {
            const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
            window.addEventListener('beforeunload', warn);
            return () => window.removeEventListener('beforeunload', warn);
        }
    }, [state.status]);

    useEffect(() => {
        const nav = navigator as Navigator & { wakeLock?: { request(t: 'screen'): Promise<{ release(): Promise<void> }> } };
        if (state.status === 'running') void nav.wakeLock?.request('screen').then((w) => { wake.current = w; }).catch(() => undefined);
        if (state.status === 'done' || state.status === 'paused') void wake.current?.release().catch(() => undefined);
    }, [state.status]);

    // vibrate briefly when the phase changes (where supported)
    useEffect(() => { if (state.status === 'running') navigator.vibrate?.(60); }, [state.idx, state.status]);

    useEffect(() => { setReps(it && it.kind === 'reps' ? it.reps : null); }, [state.idx]); // eslint-disable-line react-hooks/exhaustive-deps

    type NoNow = Action extends infer A ? (A extends { now: number } ? Omit<A, 'now'> : never) : never;
    const act = useCallback((a: NoNow) => { const n = Date.now(); setNow(n); dispatch({ ...a, now: n } as Action); }, []);

    const adjust = (mode: 'shorter' | 'easier') => setItems((cur) => cur.map((i) => (mode === 'shorter' ? { ...i, sets: Math.max(1, i.sets - 1) } : { ...i, reps: i.reps ? Math.max(1, i.reps - 2) : i.reps, seconds: i.seconds ? Math.max(5, i.seconds - 10) : i.seconds })));
    const begin = () => { const n = Date.now(); setNow(n); dispatch({ t: 'init', items }); dispatch({ t: 'start', now: n }); };

    const total = useMemo(() => estimateMinutes(items.map((i) => ({ sets: i.sets, reps: i.reps, seconds: i.seconds, rest_seconds: i.rest }))), [items]);

    async function save() {
        if (saving || state.startedAt === null || state.endedAt === null) return;
        setSaving(true);
        const body = {
            client_id: `ws-${state.startedAt}`, program_id: prep.programId, name: prep.name,
            started_at: new Date(state.startedAt).toISOString(), ended_at: new Date(Math.max(state.endedAt, state.startedAt + 1000)).toISOString(),
            effective_seconds: Math.max(1, totalActiveSeconds(state, state.endedAt)), status: state.stoppedEarly ? 'stopped' : 'finished',
            perceived_difficulty: difficulty, notes: notes || null,
            exercises: state.items.map((i, k) => ({ exercise_id: i.exerciseId, planned_sets: i.sets, sets: state.results[k], skipped: state.skipped[k] })),
        };
        try {
            const r = await submitEntry<WorkoutSession>('/api/v1/workout-sessions', body, `Séance : ${prep.name}`);
            if (r.status === 'synced') setSaved({ session: r.data, queued: false });
            else { setSaved({ session: { id: 0 } as WorkoutSession, queued: true }); toast('Hors ligne : la séance est gardée sur cet appareil et sera envoyée au retour du réseau.', 'warn'); }
        } catch (e) {
            toast(e instanceof ApiError ? e.message : 'Enregistrement impossible.', 'danger');
        } finally {
            setSaving(false);
        }
    }

    async function logActivity(choice?: 'skip' | 'keep_both' | 'replace') {
        if (!saved || saved.queued) return;
        try {
            const r = await post<{ logged: boolean; message?: string; estimate?: { net_kcal: number | null } }>(`/api/v1/workout-sessions/${saved.session.id}/log-activity`, choice ? { on_duplicate: choice } : {});
            setConflicts(null);
            setLogged(r.logged ? `Séance ajoutée à votre journal d'activités${r.estimate?.net_kcal != null ? ` (≈ ${fmtKcal(r.estimate.net_kcal)} nettes, estimation)` : ''}.` : r.message ?? "Rien n'a été ajouté.");
        } catch (e) {
            if (e instanceof ApiError && e.status === 409) {
                if (e.body.code === 'already_logged') setLogged('Cette séance est déjà dans votre journal.');
                else setConflicts((e.body.conflicts as Conflict[] | undefined) ?? []);
            } else toast(e instanceof ApiError ? e.message : 'Ajout impossible.', 'danger');
        }
    }

    // ---------------- views ----------------
    if (state.status === 'idle') {
        return (
            <div className="space-y-5">
                <Link to="/app/exercises/programs" className="text-sm font-semibold text-brand-700 underline">← Mes programmes</Link>
                <h1 className="text-2xl font-bold text-brand-900">{prep.name}</h1>
                <AccessNotice access={access} />
                <Card>
                    <p className="text-sm text-muted">{items.length} exercices · {plannedSetsOf(items)} séries · ≈ {total} min</p>
                    <ol className="mt-3 space-y-2">{items.map((i, k) => <li key={`${i.exerciseId}-${k}`} className="flex items-center gap-3 rounded-2xl bg-sand p-2"><img src={catalog[i.exerciseId]?.image_start ?? '/images/exercises/banner.svg'} alt="" width={64} height={44} className="h-11 w-16 rounded-lg object-cover" loading="lazy" /><div className="min-w-0 flex-1"><p className="text-sm font-semibold">{k + 1}. {i.name}</p><p className="text-xs text-muted">{i.sets} × {i.kind === 'time' ? `${i.seconds} s` : `${i.reps} rép.`} · repos {i.rest} s · {CAT_LABEL[i.category]}</p></div></li>)}</ol>
                    <div className="mt-4 flex flex-wrap gap-2">
                        <Button variant="secondary" className="min-h-11" onClick={() => adjust('shorter')}>Raccourcir (1 série de moins)</Button>
                        <Button variant="secondary" className="min-h-11" onClick={() => adjust('easier')}>Réduire l'intensité</Button>
                    </div>
                </Card>
                <Alert tone="warn" title="Avant de commencer"><p>Échauffez-vous quelques minutes. Arrêtez en cas de douleur inhabituelle, de vertige ou d'essoufflement anormal. Vous pouvez raccourcir, alléger ou arrêter à tout moment : Moyo n'augmente jamais l'effort à votre place.</p></Alert>
                {blocked ? <Alert tone="danger" title="Séance non proposée">{access.messages.map((m) => <p key={m.code}>{m.text}</p>)}</Alert>
                    : <Button className="min-h-14 w-full text-base" onClick={begin} disabled={items.length === 0}><Play className="h-5 w-5" aria-hidden /> Démarrer ma séance</Button>}
            </div>
        );
    }

    if (state.status === 'done') {
        const secs = totalActiveSeconds(state, state.endedAt ?? now);
        const sets = doneSets(state);
        return (
            <div className="space-y-5">
                <h1 className="text-2xl font-bold text-brand-900">{state.stoppedEarly ? 'Séance arrêtée' : 'Séance terminée'}</h1>
                {state.stoppedEarly && <Alert tone="warn" title="Vous avez arrêté la séance"><p>Si vous avez ressenti une douleur, un vertige ou un essoufflement anormal, notez-le dans vos symptômes et demandez un avis médical. En cas d'essoufflement important au repos, de douleur thoracique ou de malaise : secours médicaux d'urgence.</p><p><Link to="/app/symptoms" className="font-semibold underline">Noter un symptôme</Link></p></Alert>}
                <Card>
                    <dl className="grid grid-cols-3 gap-2 text-center">
                        <div className="rounded-2xl bg-brand-50 p-3"><dt className="text-xs text-muted">Durée effective</dt><dd className="text-xl font-extrabold">{fmtClock(secs)}</dd></div>
                        <div className="rounded-2xl bg-brand-50 p-3"><dt className="text-xs text-muted">Séries faites</dt><dd className="text-xl font-extrabold">{sets}/{plannedSets(state)}</dd></div>
                        <div className="rounded-2xl bg-brand-50 p-3"><dt className="text-xs text-muted">Exercices</dt><dd className="text-xl font-extrabold">{state.results.filter((r) => r.length).length}/{state.items.length}</dd></div>
                    </dl>
                    <ul className="mt-4 divide-y divide-sand-2 text-sm">{state.items.map((i, k) => <li key={k} className="flex justify-between gap-2 py-2"><span className="font-medium">{i.name}</span><span className="text-muted">{state.results[k].length ? state.results[k].map((r) => (r.reps != null ? `${r.reps}` : `${r.seconds}s`)).join(' · ') : 'non fait'}</span></li>)}</ul>
                </Card>
                {sets === 0 ? <Alert tone="info"><p>Aucune série n'a été faite : rien n'est enregistré.</p></Alert> : !saved ? (
                    <Card className="space-y-3">
                        <Rating label="Difficulté ressentie (facultatif)" max={5} value={difficulty} onChange={setDifficulty} lowText="1 = très facile" highText="5 = très dur" />
                        <Textarea label="Notes (facultatif)" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} />
                        <Button className="min-h-12 w-full" loading={saving} onClick={() => void save()}>Enregistrer la séance</Button>
                    </Card>
                ) : saved.queued ? <Alert tone="warn" title="En attente d'envoi"><p>La séance est gardée sur cet appareil et sera enregistrée dès le retour du réseau. Elle n'est pas encore confirmée par le serveur.</p></Alert> : (
                    <Card className="space-y-3">
                        <Alert tone="ok" title="Séance enregistrée"><p>{saved.session.calories_est != null ? `Dépense estimée ≈ ${fmtKcal(saved.session.calories_est)} (nette, au-dessus du repos).` : 'Dépense non estimable.'}</p><p className="text-xs">{saved.session.calories_method}</p></Alert>
                        {logged ? <Alert tone="info">{logged} <Link to="/app/energy" className="font-semibold underline">Voir mon bilan</Link></Alert> : (
                            <div><Button className="min-h-12 w-full" onClick={() => void logActivity()}>Ajouter à mon journal d'activités</Button><p className="mt-1 text-xs text-muted">Vous choisissez : rien n'est ajouté sans votre accord, et un contrôle évite de compter deux fois une activité similaire.</p></div>
                        )}
                    </Card>
                )}
                <div className="flex flex-wrap gap-3 text-sm font-semibold"><Link to="/app/exercises/progress" className="text-brand-700 underline">Ma progression</Link><Link to="/app/exercises" className="text-brand-700 underline">Exercices physiques</Link></div>
                <Modal open={conflicts !== null} onClose={() => setConflicts(null)} title="Cette séance est peut-être déjà comptée">
                    <div className="space-y-3 text-sm">
                        <p>Ces activités se chevauchent avec votre séance :</p>
                        <ul className="list-disc pl-5">{conflicts?.map((c) => <li key={c.id}>{c.name} ({c.source_type === 'manual' ? 'saisie manuelle' : c.source_type === 'gps' ? 'GPS' : c.source_type}, {c.duration_minutes ?? '?'} min)</li>)}</ul>
                        <div className="flex flex-col gap-2">
                            <Button onClick={() => void logActivity('replace')} disabled={conflicts?.some((c) => c.source_type !== 'manual')}>Remplacer par cette séance (supprime l'entrée manuelle)</Button>
                            <Button variant="secondary" onClick={() => void logActivity('keep_both')}>Garder les deux (je suis sûr·e que ce sont deux activités)</Button>
                            <Button variant="secondary" onClick={() => void logActivity('skip')}>Ne rien ajouter</Button>
                        </div>
                    </div>
                </Modal>
            </div>
        );
    }

    // running / paused
    const resting = step?.type === 'rest';
    const rem = remainingSeconds(state, now);
    const elapsed = Math.floor(stepElapsedMs(state, now) / 1000);
    const nextEx = resting && step ? state.items[Math.min(state.items.length - 1, step.set + 1 >= state.items[step.ex].sets ? step.ex + 1 : step.ex)] : null;
    const shown = resting && nextEx ? catalog[nextEx.exerciseId] : ex;
    const paused = state.status === 'paused';

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-2 text-sm">
                <p className="font-semibold">{prep.name}</p>
                <p className="tabular-nums text-muted" aria-label="Durée effective">{fmtClock(totalActiveSeconds(state, now))}</p>
            </div>
            <div className="h-2 rounded-full bg-brand-100" role="progressbar" aria-label="Avancement de la séance" aria-valuemin={0} aria-valuemax={state.steps.length} aria-valuenow={state.idx}><div className="h-2 rounded-full bg-brand-600 transition-all" style={{ width: `${(state.idx / state.steps.length) * 100}%` }} /></div>

            <Card className={cx('space-y-3', resting && 'bg-sky-50')}>
                {resting ? <Badge tone="info">Repos · prochain : {nextEx?.name}</Badge> : <Badge tone="ok">Exercice {step!.ex + 1}/{state.items.length} · série {step!.set + 1}/{it!.sets}</Badge>}
                <h1 className="text-2xl font-extrabold tracking-tight text-brand-900">{resting ? 'Récupérez' : it!.name}</h1>
                {shown && (
                    <div className="grid grid-cols-2 gap-2"><ExImage src={shown.image_start} alt={`${shown.name} : position de départ`} /><ExImage src={shown.image_end} alt={`${shown.name} : position finale`} /></div>
                )}
                <div className="rounded-3xl bg-white p-4 text-center" aria-live="polite">
                    {rem !== null ? <p className="text-6xl font-extrabold tabular-nums text-brand-900" aria-label={`${rem} secondes restantes`}>{fmtClock(rem)}</p>
                        : <><p className="text-3xl font-extrabold text-brand-900">{it!.reps} répétitions</p><p className="text-sm text-muted">Chrono : {fmtClock(elapsed)}</p></>}
                    {paused && <p className="mt-2 font-semibold text-amber-900">En pause : le chrono est arrêté.</p>}
                </div>
                {!resting && ex && (
                    <details className="rounded-2xl bg-sand p-3 text-sm" open>
                        <summary className="cursor-pointer font-semibold">Instructions</summary>
                        <ol className="mt-2 list-decimal space-y-1 pl-5">{ex.steps.map((s) => <li key={s}>{s}</li>)}</ol>
                        <p className="mt-2 flex items-start gap-2"><Wind className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-hidden /> {ex.breathing}</p>
                        <p className="mt-2 text-muted">À éviter : {ex.mistakes.join(' ; ')}</p>
                    </details>
                )}
            </Card>

            {!resting && it!.kind === 'reps' && (
                <div className="flex items-center justify-center gap-4" role="group" aria-label="Répétitions réalisées">
                    <Button variant="secondary" className="h-14 w-14 p-0" aria-label="Une répétition de moins" onClick={() => setReps((r) => Math.max(0, (r ?? 0) - 1))}><Minus className="h-5 w-5" /></Button>
                    <p className="min-w-24 text-center text-3xl font-extrabold tabular-nums">{reps ?? 0}<span className="block text-xs font-normal text-muted">réalisées</span></p>
                    <Button variant="secondary" className="h-14 w-14 p-0" aria-label="Une répétition de plus" onClick={() => setReps((r) => (r ?? 0) + 1)}><Plus className="h-5 w-5" /></Button>
                </div>
            )}

            <div className="grid grid-cols-2 gap-3">
                {resting ? <Button className="col-span-2 min-h-14" onClick={() => act({ t: 'skipRest' })} disabled={paused}><SkipForward className="h-5 w-5" aria-hidden /> Passer le repos</Button>
                    : <Button className="col-span-2 min-h-14 text-base" onClick={() => act({ t: 'completeSet', reps: reps ?? undefined })} disabled={paused}>{it!.kind === 'time' ? 'Terminer cette série maintenant' : 'Série terminée'}</Button>}
                <Button variant="secondary" className="min-h-14" onClick={() => act({ t: 'prevExercise' })} disabled={paused}><ChevronLeft className="h-5 w-5" aria-hidden /> Précédent</Button>
                <Button variant="secondary" className="min-h-14" onClick={() => act({ t: 'nextExercise' })} disabled={paused}>Suivant <ChevronRight className="h-5 w-5" aria-hidden /></Button>
                <Button variant="secondary" className="min-h-14" onClick={() => act(paused ? { t: 'resume' } : { t: 'pause' })}>{paused ? <><Play className="h-5 w-5" aria-hidden /> Reprendre</> : <><Pause className="h-5 w-5" aria-hidden /> Pause</>}</Button>
                <Button variant="danger" className="min-h-14" onClick={() => act({ t: 'finish', early: true })}><OctagonX className="h-5 w-5" aria-hidden /> Terminer</Button>
            </div>
            <p className="rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"><strong>Arrêtez</strong> en cas de douleur inhabituelle, de vertige ou d'essoufflement anormal. <button type="button" className="font-semibold underline" onClick={() => act({ t: 'finish', early: true })}>Je ne me sens pas bien : arrêter la séance</button></p>
        </div>
    );
}

const plannedSetsOf = (items: { sets: number }[]) => items.reduce((n, i) => n + i.sets, 0);
