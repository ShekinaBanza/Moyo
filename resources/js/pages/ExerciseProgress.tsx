import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { del, get, NetworkError } from '@/lib/api';
import { fmtDateTime, fmtKcal, fmtDuration } from '@/lib/format';
import { Alert, Badge, Card, ConfirmButton, EmptyState, ErrorState, PageHeader, Select, Spinner, useToast } from '@/components/ui';
import type { WorkoutSession } from '@/types/exercises';

/** Monday of the week containing the given date, as YYYY-MM-DD (local time). */
function weekStart(d: Date): string {
    const x = new Date(d);
    x.setHours(12, 0, 0, 0);
    x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

export default function ExerciseProgress() {
    const toast = useToast();
    const [sessions, setSessions] = useState<WorkoutSession[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [exId, setExId] = useState('');

    const load = () => get<{ data: WorkoutSession[] }>('/api/v1/workout-sessions?limit=300').then((r) => { setSessions(r.data); setError(null); }).catch((e) => setError(e instanceof NetworkError ? 'Hors ligne : historique indisponible.' : 'Chargement impossible.'));
    useEffect(() => { void load(); }, []);

    const weeks = useMemo(() => {
        const map = new Map<string, { week: string; sessions: number; minutes: number }>();
        const start = new Date();
        start.setDate(start.getDate() - 7 * 7);
        for (let i = 0; i < 8; i++) {
            const d = new Date(start);
            d.setDate(d.getDate() + i * 7);
            const w = weekStart(d);
            map.set(w, { week: w, sessions: 0, minutes: 0 });
        }
        (sessions ?? []).forEach((s) => {
            const w = weekStart(new Date(s.started_at));
            const row = map.get(w);
            if (row) { row.sessions += 1; row.minutes += Math.round(s.effective_seconds / 60); }
        });
        return [...map.values()];
    }, [sessions]);

    const exercises = useMemo(() => {
        const m = new Map<number, string>();
        (sessions ?? []).forEach((s) => s.items.forEach((i) => i.exercise_id && i.sets.length && m.set(i.exercise_id, i.name)));
        return [...m.entries()];
    }, [sessions]);

    const perf = useMemo(() => {
        if (!exId) return [];
        return (sessions ?? []).slice().reverse().flatMap((s) => {
            const it = s.items.find((i) => String(i.exercise_id) === exId && i.sets.length);
            if (!it) return [];
            const timed = it.sets.some((x) => x.seconds != null);
            return [{ date: s.started_at, value: timed ? Math.max(...it.sets.map((x) => x.seconds ?? 0)) : it.sets.reduce((n, x) => n + (x.reps ?? 0), 0), timed }];
        });
    }, [sessions, exId]);
    const timed = perf[0]?.timed ?? false;
    const total = sessions?.length ?? 0;
    const totalMin = Math.round((sessions ?? []).reduce((n, s) => n + s.effective_seconds, 0) / 60);

    return (
        <div className="space-y-5">
            <PageHeader title="Ma progression" subtitle="Calculée uniquement à partir des séances que vous avez réellement enregistrées." image="/images/exercises/banner.svg" action={<Link to="/app/exercises" className="text-sm font-semibold text-brand-700 underline">← Exercices physiques</Link>} />
            {error && <ErrorState text={error} onRetry={() => void load()} />}
            {!sessions && !error && <Spinner />}
            {sessions && sessions.length === 0 && <Card><EmptyState image="/images/illustrations/first-use.svg" title="Aucune séance enregistrée" text="Terminez une séance pour voir votre historique et vos graphiques apparaître ici." action={<Link to="/app/exercises/programs" className="inline-flex min-h-11 items-center rounded-full bg-brand-600 px-5 text-sm font-semibold text-white">Choisir une séance</Link>} /></Card>}
            {sessions && sessions.length > 0 && (
                <>
                    <div className="grid grid-cols-2 gap-3"><Card><p className="text-xs text-muted">Séances enregistrées</p><p className="text-3xl font-extrabold">{total}</p></Card><Card><p className="text-xs text-muted">Temps d'entraînement total</p><p className="text-3xl font-extrabold">{fmtDuration(totalMin)}</p></Card></div>
                    <Card aria-labelledby="w1">
                        <h2 id="w1" className="font-bold">Séances par semaine</h2>
                        <p className="mb-2 text-xs text-muted">8 dernières semaines · nombre de séances</p>
                        <div className="h-52" role="img" aria-label={`Séances par semaine : ${weeks.map((w) => `${w.week} ${w.sessions}`).join(', ')}`}><ResponsiveContainer width="100%" height="100%" minWidth={0}><BarChart data={weeks} margin={{ left: -20, right: 4, top: 4 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" /><XAxis dataKey="week" tickFormatter={(v: string) => v.slice(8) + '/' + v.slice(5, 7)} tick={{ fontSize: 11 }} /><YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={40} /><Tooltip formatter={(v) => [String(v), 'Séances']} labelFormatter={(l) => `Semaine du ${String(l)}`} /><Bar dataKey="sessions" fill="#0f766e" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div>
                    </Card>
                    <Card aria-labelledby="w2">
                        <h2 id="w2" className="font-bold">Durée d'entraînement par semaine</h2>
                        <p className="mb-2 text-xs text-muted">minutes · durée effective (pauses exclues)</p>
                        <div className="h-52" role="img" aria-label="Durée d'entraînement par semaine"><ResponsiveContainer width="100%" height="100%" minWidth={0}><BarChart data={weeks} margin={{ left: -20, right: 4, top: 4 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" /><XAxis dataKey="week" tickFormatter={(v: string) => v.slice(8) + '/' + v.slice(5, 7)} tick={{ fontSize: 11 }} /><YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={40} /><Tooltip formatter={(v) => [`${v} min`, 'Durée']} labelFormatter={(l) => `Semaine du ${String(l)}`} /><Bar dataKey="minutes" fill="#14b8a6" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div>
                    </Card>
                    <Card aria-labelledby="perf">
                        <h2 id="perf" className="font-bold">Performance par exercice</h2>
                        <Select label="Exercice" value={exId} onChange={(e) => setExId(e.target.value)}><option value="">Choisir un exercice…</option>{exercises.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</Select>
                        {exId && perf.length < 2 && <p className="mt-3 text-sm text-muted">Il faut au moins 2 séances avec cet exercice pour tracer une évolution ({perf.length} pour l'instant).</p>}
                        {perf.length >= 2 && (
                            <div className="mt-3"><p className="mb-1 text-xs text-muted">{timed ? 'meilleure durée tenue (secondes)' : 'total de répétitions réalisées'} · par séance</p>
                                <div className="h-52" role="img" aria-label="Évolution de la performance"><ResponsiveContainer width="100%" height="100%" minWidth={0}><LineChart data={perf} margin={{ left: -20, right: 8, top: 4 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" /><XAxis dataKey="date" tickFormatter={(v: string) => new Date(v).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} width={40} /><Tooltip formatter={(v) => [String(v), timed ? 'secondes' : 'répétitions']} labelFormatter={(l) => fmtDateTime(String(l))} /><Line type="monotone" dataKey="value" stroke="#0f766e" strokeWidth={3} dot={{ r: 3 }} /></LineChart></ResponsiveContainer></div>
                                <p className="mt-1 text-xs text-muted">Une hausse n'est pas un objectif obligatoire : la charge et le volume restent votre choix.</p></div>
                        )}
                    </Card>
                    <Card aria-labelledby="hist">
                        <h2 id="hist" className="mb-3 font-bold">Historique des séances</h2>
                        <ul className="divide-y divide-sand-2">
                            {sessions.map((s) => (
                                <li key={s.id} className="flex items-start justify-between gap-3 py-3">
                                    <div className="min-w-0"><p className="font-semibold">{s.name} <span className="font-normal text-muted">· {fmtDateTime(s.started_at)}</span></p>
                                        <p className="text-sm text-muted">{fmtDuration(Math.round(s.effective_seconds / 60))} effectives{s.perceived_difficulty ? ` · difficulté ${s.perceived_difficulty}/5` : ''}{s.status === 'stopped' ? ' · arrêtée avant la fin' : ''}</p>
                                        <p className="mt-1 text-xs text-muted">{s.items.map((i) => `${i.name} (${i.sets.length ? i.sets.map((x) => (x.reps != null ? x.reps : `${x.seconds}s`)).join('/') : 'non fait'})`).join(' · ')}</p>
                                        <p className="mt-1 flex flex-wrap gap-2">{s.calories_est != null ? <Badge tone="info" >≈ {fmtKcal(s.calories_est)} nettes (estimation)</Badge> : <Badge>Dépense non estimable</Badge>}{s.activity_entry_id && <Badge tone="ok">Dans mon journal</Badge>}</p>
                                        {s.notes && <p className="mt-1 text-sm">{s.notes}</p>}</div>
                                    <ConfirmButton variant="ghost" className="px-3" aria-label="Supprimer cette séance" message="Supprimer cette séance de l'historique ? L'activité ajoutée au journal, le cas échéant, est conservée." onConfirm={async () => { await del(`/api/v1/workout-sessions/${s.id}`); toast('Séance supprimée.'); await load(); }}><Trash2 className="h-4 w-4" aria-hidden /></ConfirmButton>
                                </li>
                            ))}
                        </ul>
                    </Card>
                    <Alert tone="info">Les calories d'une séance sont des estimations calculées avec un modèle (MET). Voir docs/EXERCISES.md.</Alert>
                </>
            )}
        </div>
    );
}
