import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Activity, Apple, Bed, CalendarDays, Check, Dumbbell, Flame, HeartPulse, MapPinned, Ruler, Watch } from 'lucide-react';
import { get, patch, post } from '@/lib/api';
import { newClientId } from '@/lib/offline';
import { fmtDate, fmtDateTime, fmtDuration, fmtKcal, fmtNumber, fmtSigned, localDate, MEAL_LABEL, NA, SOURCE_LABEL, SYMPTOM_LABEL } from '@/lib/format';
import { useAuth } from '@/hooks/useAuth';
import { Badge, Card, EmptyState, ErrorState, Spinner, cx, useToast } from '@/components/ui';
import { SafetyBanner } from '@/components/SafetyBanner';
import type { Dashboard as D, EnergyDay } from '@/types';

const HABITS: Record<string, string> = { water: "Boire de l'eau", no_soda: 'Pas de soda', walk: 'Marcher', vegetables: 'Légumes', sleep_routine: 'Routine de sommeil' };

function Tile({ to, icon, title, children, image }: { to: string; icon: ReactNode; title: string; children: ReactNode; image?: string }) {
    return (
        <Card as="article" className="relative overflow-hidden">
            <Link to={to} className="absolute inset-0 z-10" aria-label={`Ouvrir : ${title}`} />
            {image && <img src={image} alt="" width={96} height={72} loading="lazy" className="absolute -right-2 -top-2 h-20 w-24 opacity-90" />}
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-muted">{icon} {title}</h2>
            {children}
        </Card>
    );
}

const Big = ({ children }: { children: ReactNode }) => <p className="text-2xl font-extrabold tracking-tight text-brand-900">{children}</p>;

export default function Dashboard() {
    const { user } = useAuth();
    const toast = useToast();
    const [d, setD] = useState<D | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [energy, setEnergy] = useState<EnergyDay | null>(null);

    const load = useCallback(async () => {
        try {
            setD((await get<{ data: D }>('/api/v1/dashboard')).data);
            setError(null);
        } catch (e) {
            setError(e instanceof Error && e.message.includes('Réseau') ? 'Vous êtes hors ligne : le tableau de bord ne peut pas être chargé, mais vous pouvez toujours saisir vos données.' : 'Chargement impossible.');
        }
    }, []);
    useEffect(() => {
        void load();
        get<{ data: EnergyDay }>('/api/v1/energy/daily').then((r) => setEnergy(r.data)).catch(() => undefined);
    }, [load]);

    async function toggleHabit(habit: string) {
        const today = localDate();
        const existing = d?.habits_today.find((h) => h.habit === habit);
        try {
            if (existing) await patch(`/api/v1/habits/${existing.id}`, { done: !existing.done });
            else await post('/api/v1/habits', { habit, day: today, done: true, client_id: newClientId() });
            await load();
        } catch {
            toast("Habitude non enregistrée (réseau indisponible).", 'warn');
        }
    }

    if (error && !d) return <ErrorState text={error} onRetry={() => void load()} />;
    if (!d) return <Spinner />;

    const now = new Date();
    const nothingYet = !d.sleep && !d.recent_meals.length && !d.weight && !d.recent_symptoms.length && d.activity_today.entries === 0;

    return (
        <div className="space-y-5">
            <section className="relative overflow-hidden rounded-3xl bg-brand-700 p-6 text-white">
                <img src="/images/illustrations/hero.svg" alt="" width={240} height={200} className="absolute -bottom-6 -right-8 hidden h-48 w-56 rounded-3xl opacity-90 sm:block" />
                <p className="text-sm text-brand-100">{now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
                <h1 className="mt-1 text-2xl font-extrabold">Bonjour {user!.name.split(' ')[0]}</h1>
                <p className="mt-1 max-w-md text-sm text-brand-100">Voici ce que vous avez enregistré. Seules vos données réelles sont affichées.</p>
            </section>

            <SafetyBanner safety={d.safety} />

            {nothingYet && (
                <Card>
                    <EmptyState image="/images/illustrations/first-use.svg" title="Commençons par une première saisie" text="Aucune donnée n'est encore enregistrée. Choisissez ce que vous voulez noter : tout est facultatif."
                        action={<div className="flex flex-wrap justify-center gap-2">{[['/app/sleep', 'Ma nuit'], ['/app/food', 'Un repas'], ['/app/body', 'Mon poids'], ['/app/symptoms', 'Un symptôme']].map(([to, l]) => <Link key={to} to={to} className="inline-flex min-h-11 items-center rounded-full bg-brand-600 px-5 text-sm font-semibold text-white">{l}</Link>)}</div>} />
                </Card>
            )}

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Tile to="/app/energy" icon={<Flame className="h-4 w-4" aria-hidden />} title="Mon bilan énergétique" image="/images/foods/fruits.svg">
                    {energy ? (
                        <>
                            <Big>{fmtSigned(energy.balance.kcal)}</Big>
                            <p className="text-sm text-muted">Consommées : {fmtKcal(energy.consumed.total_kcal)} · Dépensées : {fmtKcal(energy.expenditure.total_kcal)}</p>
                            {energy.balance.kcal === null && energy.balance.reasons[0] && <p className="mt-1 text-xs text-muted">{energy.balance.reasons[0]}</p>}
                            <p className="mt-1 text-xs text-muted">Estimation du jour en cours, pas une mesure.</p>
                        </>
                    ) : <><Big>{NA}</Big><p className="text-sm text-muted">Calcul en cours…</p></>}
                </Tile>

                <Tile to="/app/exercises" icon={<Dumbbell className="h-4 w-4" aria-hidden />} title="Exercices physiques" image="/images/exercises/cat-musculation.svg">
                    <p className="font-semibold">Musculation, abdominaux, mobilité</p>
                    <p className="text-sm text-muted">Séances guidées avec minuteur, programmes et progression.</p>
                </Tile>

                <Tile to="/app/day" icon={<CalendarDays className="h-4 w-4" aria-hidden />} title="Ma journée" image="/images/illustrations/habits.svg">
                    <p className="font-semibold">Chronologie et récapitulatif</p>
                    <p className="text-sm text-muted">Repas, activités, trajets, sommeil et rappels du jour.</p>
                    <p className="mt-2 flex items-center gap-1 text-xs text-muted"><MapPinned className="h-3.5 w-3.5" aria-hidden /> <Link to="/app/map" className="relative z-20 underline">Carte et déplacements</Link></p>
                </Tile>

                <Tile to="/app/sleep" icon={<Bed className="h-4 w-4" aria-hidden />} title="Dernier sommeil" image="/images/illustrations/sleep.svg">
                    {d.sleep ? (
                        <>
                            <Big>{fmtDuration(d.sleep.sleep_minutes)}</Big>
                            <p className="text-sm text-muted">Nuit du {fmtDate(d.sleep.night_date)} · au lit {fmtDuration(d.sleep.time_in_bed_minutes)}</p>
                            <p className="mt-2"><Badge>{SOURCE_LABEL[d.sleep.source_type]}</Badge></p>
                            {d.goals.sleep_goal_hours && <p className="mt-2 text-xs text-muted">Objectif : {d.goals.sleep_goal_hours} h</p>}
                        </>
                    ) : <><Big>{NA}</Big><p className="text-sm text-muted">Aucune nuit enregistrée.</p></>}
                </Tile>

                <Tile to="/app/activity" icon={<Activity className="h-4 w-4" aria-hidden />} title="Activité aujourd'hui" image="/images/illustrations/activity.svg">
                    {d.activity_today.entries > 0 ? (
                        <>
                            <Big>{d.activity_today.steps !== null ? `${fmtNumber(d.activity_today.steps)} pas` : fmtDuration(d.activity_today.duration_minutes)}</Big>
                            <p className="text-sm text-muted">{d.activity_today.entries} activité(s) · Sources : {d.activity_today.sources.map((s) => SOURCE_LABEL[s]).join(', ')}</p>
                            {d.goals.steps_goal && d.activity_today.steps !== null && (
                                <div className="mt-2" role="img" aria-label={`${Math.min(100, Math.round((d.activity_today.steps / d.goals.steps_goal) * 100))} % de l'objectif de pas`}>
                                    <div className="h-2 rounded-full bg-brand-100"><div className="h-2 rounded-full bg-brand-600" style={{ width: `${Math.min(100, (d.activity_today.steps / d.goals.steps_goal) * 100)}%` }} /></div>
                                    <p className="mt-1 text-xs text-muted">Objectif : {fmtNumber(d.goals.steps_goal)} pas</p>
                                </div>
                            )}
                        </>
                    ) : <><Big>{NA}</Big><p className="text-sm text-muted">Rien de noté aujourd'hui. Saisie manuelle possible.</p></>}
                </Tile>

                <Tile to="/app/food" icon={<Apple className="h-4 w-4" aria-hidden />} title="Derniers repas" image="/images/foods/foufou.svg">
                    {d.recent_meals.length ? (
                        <ul className="space-y-1 text-sm">{d.recent_meals.map((m) => <li key={m.id}><strong>{m.name}</strong> <span className="text-muted">· {MEAL_LABEL[m.meal_type]}, {fmtDateTime(m.eaten_at)}</span></li>)}</ul>
                    ) : <><Big>{NA}</Big><p className="text-sm text-muted">Aucun repas noté.</p></>}
                </Tile>

                <Tile to="/app/body" icon={<Ruler className="h-4 w-4" aria-hidden />} title="Mesures corporelles">
                    {d.weight || d.waist ? (
                        <div className="space-y-1">
                            {d.weight && <p><Big>{fmtNumber(d.weight.value, d.weight.unit)}</Big><span className="text-xs text-muted">Poids · {fmtDateTime(d.weight.measured_at)}</span></p>}
                            {d.waist && <p className="text-sm"><strong>{fmtNumber(d.waist.value, d.waist.unit)}</strong> <span className="text-muted">tour de taille · {fmtDateTime(d.waist.measured_at)}</span></p>}
                        </div>
                    ) : <><Big>{NA}</Big><p className="text-sm text-muted">Aucune mesure enregistrée.</p></>}
                </Tile>

                <Tile to="/app/symptoms" icon={<HeartPulse className="h-4 w-4" aria-hidden />} title="Symptômes (7 jours)">
                    {d.recent_symptoms.length ? (
                        <ul className="space-y-1 text-sm">{d.recent_symptoms.map((s) => <li key={s.id}>{SYMPTOM_LABEL[s.symptom_type]} <span className="text-muted">· {s.intensity}/10 · {fmtDateTime(s.occurred_at)}</span></li>)}</ul>
                    ) : <p className="text-sm text-muted">Aucun symptôme noté ces 7 derniers jours.</p>}
                </Tile>

                <Tile to="/app/watch" icon={<Watch className="h-4 w-4" aria-hidden />} title="Ma montre (facultative)" image="/images/illustrations/watch.svg">
                    {d.device ? (
                        <>
                            <p className="font-semibold">{d.device.name}</p>
                            <p className="text-sm text-muted">{d.device.connection_status === 'connected' ? 'Connectée à la dernière visite' : d.device.connection_status === 'paired' || d.device.connection_status === 'disconnected' ? 'Associée, non connectée' : d.device.connection_status}</p>
                            <p className="mt-1"><Badge tone="warn">{d.device.integration_status === 'partial' ? 'Intégration partielle (fréquence cardiaque seulement)' : 'Intégration en cours de vérification'}</Badge></p>
                        </>
                    ) : <><p className="font-semibold">Aucune montre associée</p><p className="text-sm text-muted">Pas nécessaire : saisissez vos données à la main, ou connectez votre montre si vous le souhaitez.</p></>}
                    <p className="mt-2 text-xs text-muted">
                        Dernière mesure reçue : {d.last_measurement ? `${d.last_measurement.value ?? NA} ${d.last_measurement.unit} (${SOURCE_LABEL[d.last_measurement.source_type]}, ${fmtDateTime(d.last_measurement.measured_at)})` : NA}
                    </p>
                </Tile>
            </div>

            <Card aria-labelledby="habits">
                <h2 id="habits" className="mb-1 text-lg font-bold">Habitudes du jour</h2>
                <p className="mb-3 text-sm text-muted">Touchez pour cocher. Aucun objectif imposé.</p>
                <ul className="flex flex-wrap gap-2">
                    {Object.entries(HABITS).map(([k, label]) => {
                        const done = d.habits_today.find((h) => h.habit === k)?.done ?? false;
                        return (
                            <li key={k}>
                                <button type="button" aria-pressed={done} onClick={() => void toggleHabit(k)} className={cx('inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium', done ? 'border-brand-600 bg-brand-600 text-white' : 'border-sand-2 bg-white hover:bg-brand-50')}>
                                    {done && <Check className="h-4 w-4" aria-hidden />} {label}
                                </button>
                            </li>
                        );
                    })}
                </ul>
            </Card>
        </div>
    );
}
