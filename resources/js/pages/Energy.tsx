import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChevronLeft, ChevronRight, Flame, Info, UtensilsCrossed } from 'lucide-react';
import { get, NetworkError } from '@/lib/api';
import { fmtKcal, fmtSigned, localDate, MEAL_LABEL, NA, QUALITY_LABEL } from '@/lib/format';
import { Alert, Badge, Button, Card, EmptyState, ErrorState, Input, PageHeader, Spinner } from '@/components/ui';
import type { EnergyDay } from '@/types';

const STATUS_TEXT: Record<string, { title: string; text: (n: number) => string; tone: 'warn' | 'info' | 'ok' }> = {
    surplus: { title: 'Apports estimés supérieurs à la dépense estimée', text: (n) => `Environ ${Math.abs(Math.round(n)).toLocaleString('fr-FR')} kcal de plus consommées que dépensées.`, tone: 'info' },
    deficit: { title: 'Dépense estimée supérieure aux apports estimés', text: (n) => `Environ ${Math.abs(Math.round(n)).toLocaleString('fr-FR')} kcal de plus dépensées que consommées.`, tone: 'info' },
    close: { title: 'Apports et dépense estimés proches', text: () => 'L\'écart estimé est inférieur à 100 kcal, soit moins que la marge d\'erreur du calcul.', tone: 'ok' },
};

export default function Energy() {
    const [params] = useSearchParams();
    const [date, setDate] = useState(params.get('date') ?? localDate());
    const [d, setD] = useState<EnergyDay | null>(null);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setD(null);
        setError(null);
        try {
            setD((await get<{ data: EnergyDay }>(`/api/v1/energy/daily?date=${date}`)).data);
        } catch (e) {
            setError(e instanceof NetworkError ? 'Vous êtes hors ligne : le bilan est calculé par le serveur et ne peut pas être chargé.' : 'Chargement impossible.');
        }
    }, [date]);
    useEffect(() => {
        void load();
    }, [load]);

    const shift = (n: number) => {
        const x = new Date(date + 'T12:00:00');
        x.setDate(x.getDate() + n);
        setDate(localDate(x));
    };

    const empty = d && d.consumed.entries === 0 && d.expenditure.activities.items.length === 0;
    const st = d?.balance.status ? STATUS_TEXT[d.balance.status] : null;
    const chart = d
        ? [
              { name: 'Consommées', kcal: d.consumed.total_kcal, fill: '#f59e0b' },
              { name: 'Repos', kcal: d.expenditure.resting.kcal, fill: '#0f766e' },
              { name: 'Activités (nette)', kcal: d.expenditure.activities.items.length ? d.expenditure.activities.net_kcal : null, fill: '#14b8a6' },
              { name: 'Dépense totale', kcal: d.expenditure.total_kcal, fill: '#115e59' },
          ]
        : [];

    return (
        <div className="space-y-5">
            <PageHeader title="Mon bilan énergétique" subtitle="Calories consommées, dépensées et bilan estimé du jour. Ce sont des estimations, pas des mesures." image="/images/illustrations/wellbeing.svg"
                action={<Link to="/app/energy/history" className="text-sm font-semibold text-brand-700 underline">Voir l'historique des bilans</Link>} />

            <div className="flex items-end gap-2">
                <Button variant="secondary" aria-label="Jour précédent" onClick={() => shift(-1)}><ChevronLeft className="h-4 w-4" /></Button>
                <div className="flex-1"><Input label="Date" type="date" value={date} max={localDate()} onChange={(e) => e.target.value && setDate(e.target.value)} /></div>
                <Button variant="secondary" aria-label="Jour suivant" disabled={date >= localDate()} onClick={() => shift(1)}><ChevronRight className="h-4 w-4" /></Button>
            </div>

            {error && <ErrorState text={error} onRetry={() => void load()} />}
            {!d && !error && <Spinner />}

            {d && empty && (
                <Card>
                    <EmptyState image="/images/illustrations/first-use.svg" title="Rien d'enregistré ce jour-là" text="Notez vos repas et vos activités : le bilan est calculé automatiquement à partir de vos saisies."
                        action={<div className="flex flex-wrap justify-center gap-2"><Link to="/app/food" className="inline-flex min-h-11 items-center rounded-full bg-brand-600 px-5 text-sm font-semibold text-white">Noter un repas</Link><Link to="/app/activity" className="inline-flex min-h-11 items-center rounded-full border border-brand-200 bg-white px-5 text-sm font-semibold text-brand-700">Ajouter une activité</Link></div>} />
                </Card>
            )}

            {d && !empty && (
                <>
                    <div className="grid gap-4 sm:grid-cols-3">
                        <Card as="article">
                            <h2 className="flex items-center gap-2 text-sm font-semibold text-muted"><UtensilsCrossed className="h-4 w-4" aria-hidden /> Calories consommées</h2>
                            <p className="mt-2 text-3xl font-extrabold text-brand-900">{fmtKcal(d.consumed.total_kcal)}</p>
                            <p className="mt-1 text-xs text-muted">Énergie estimée des aliments et boissons. {d.consumed.entries_with_kcal}/{d.consumed.entries} repas avec valeur.</p>
                            {d.consumed.estimated_kcal !== null && <p className="mt-1"><Badge tone="warn">dont {fmtKcal(d.consumed.estimated_kcal)} estimées</Badge></p>}
                        </Card>
                        <Card as="article">
                            <h2 className="flex items-center gap-2 text-sm font-semibold text-muted"><Flame className="h-4 w-4" aria-hidden /> Calories dépensées</h2>
                            <p className="mt-2 text-3xl font-extrabold text-brand-900">{fmtKcal(d.expenditure.total_kcal)}</p>
                            <p className="mt-1 text-xs text-muted">Repos + activités (dépense nette).</p>
                            <dl className="mt-2 space-y-0.5 text-sm">
                                <div className="flex justify-between"><dt className="text-muted">Métabolisme de repos</dt><dd className="font-semibold">{fmtKcal(d.expenditure.resting.kcal)}</dd></div>
                                <div className="flex justify-between"><dt className="text-muted">Activités (nette)</dt><dd className="font-semibold">{d.expenditure.activities.items.length ? fmtKcal(d.expenditure.activities.net_kcal) : 'Aucune activité'}</dd></div>
                            </dl>
                        </Card>
                        <Card as="article" className={d.balance.status ? '' : 'bg-sand-2/50'}>
                            <h2 className="text-sm font-semibold text-muted">Bilan énergétique estimé</h2>
                            <p className="mt-2 text-3xl font-extrabold text-brand-900">{fmtSigned(d.balance.kcal)}</p>
                            <p className="mt-1 text-xs text-muted">Consommées − dépensées totales.</p>
                            {!d.balance.complete && d.balance.kcal !== null && <p className="mt-1"><Badge tone="warn">Bilan partiel</Badge></p>}
                        </Card>
                    </div>

                    {st && d.balance.kcal !== null && (
                        <Alert tone={st.tone} title={st.title}>
                            <p>{st.text(d.balance.kcal)}</p>
                            <p>Ce chiffre ne prouve ni perte ni gain de graisse : le poids varie aussi avec l'eau, le contenu digestif et d'autres facteurs.</p>
                        </Alert>
                    )}
                    {d.balance.kcal === null && d.balance.reasons.length > 0 && (
                        <Alert tone="info" title="Bilan non calculable pour l'instant">
                            {d.balance.reasons.map((r) => <p key={r}>{r}</p>)}
                            {d.expenditure.resting.missing.length > 0 && <p><Link to="/app/profile" className="font-semibold underline">Compléter mon profil</Link> · <Link to="/app/body" className="font-semibold underline">Ajouter mon poids</Link></p>}
                        </Alert>
                    )}
                    {d.balance.caveats.length > 0 && <Alert tone="warn" title="Ce qui manque ou reste incertain">{d.balance.caveats.map((r) => <p key={r}>{r}</p>)}</Alert>}

                    <Card aria-labelledby="chart">
                        <h2 id="chart" className="mb-1 font-bold">Apports et dépenses</h2>
                        <p className="mb-3 text-xs text-muted">kcal · {new Date(date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}. Une barre absente = donnée non disponible (pas zéro).</p>
                        <div className="h-60" role="img" aria-label={`Graphique : ${chart.map((c) => `${c.name} ${c.kcal === null ? 'non disponible' : Math.round(c.kcal) + ' kcal'}`).join(', ')}`}>
                            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                                <BarChart data={chart} margin={{ top: 18, right: 4, left: -16, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                                    <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} />
                                    <YAxis tick={{ fontSize: 11 }} width={48} />
                                    <Tooltip formatter={(v) => [fmtKcal(Number(v)), 'Estimation']} />
                                    <Bar dataKey="kcal" radius={[6, 6, 0, 0]}>
                                        {chart.map((c) => <Cell key={c.name} fill={c.fill} />)}
                                        <LabelList dataKey="kcal" position="top" formatter={(v: unknown) => (v === null || v === undefined ? '' : Math.round(Number(v)))} style={{ fontSize: 11 }} />
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                        <table className="sr-only"><caption>Apports et dépenses estimés</caption><tbody>{chart.map((c) => <tr key={c.name}><th scope="row">{c.name}</th><td>{fmtKcal(c.kcal)}</td></tr>)}</tbody></table>
                    </Card>

                    <div className="grid gap-4 lg:grid-cols-2">
                        <Card aria-labelledby="meals">
                            <h2 id="meals" className="mb-3 font-bold">Répartition par repas</h2>
                            {d.consumed.by_meal.length === 0 ? <p className="text-sm text-muted">Aucun repas noté.</p> : (
                                <ul className="space-y-2">
                                    {d.consumed.by_meal.map((m) => (
                                        <li key={m.meal_type} className="flex items-center justify-between gap-2 text-sm">
                                            <span>{MEAL_LABEL[m.meal_type] ?? m.meal_type} <span className="text-muted">({m.entries})</span></span>
                                            <span className="font-semibold">{m.kcal === null ? NA : fmtKcal(m.kcal)}{m.missing > 0 && <span className="ml-1 font-normal text-amber-800">· {m.missing} sans valeur</span>}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                            {d.consumed.missing.length > 0 && <p className="mt-3 text-xs text-muted">Sans valeur calorique, donc non comptés : {d.consumed.missing.map((f) => f.name).join(', ')}. <Link to="/app/food" className="font-semibold underline">Compléter</Link></p>}
                        </Card>
                        <Card aria-labelledby="acts">
                            <h2 id="acts" className="mb-3 font-bold">Répartition par activité</h2>
                            {d.expenditure.activities.items.length === 0 ? <p className="text-sm text-muted">Aucune activité notée : seule la dépense de repos est comptée.</p> : (
                                <ul className="space-y-3">
                                    {d.expenditure.activities.items.map((a) => (
                                        <li key={a.id} className="text-sm">
                                            <p className="flex justify-between gap-2"><span className="font-medium">{a.name}</span><span className="font-semibold">{a.quality === 'unavailable' ? NA : fmtKcal(a.net_kcal)}</span></p>
                                            <p className="text-xs text-muted">{a.minutes ? `${a.minutes} min` : 'durée inconnue'}{a.met ? ` · ${a.met} MET` : ''} · {QUALITY_LABEL[a.quality]}{a.quality !== 'unavailable' ? ` · brute ${fmtKcal(a.gross_kcal)} (non ajoutée)` : ''}</p>
                                            {a.missing.length > 0 && <p className="text-xs text-amber-800">Manque : {a.missing.join(', ')}</p>}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </Card>
                    </div>

                    <Card aria-labelledby="how">
                        <h2 id="how" className="mb-2 flex items-center gap-2 font-bold"><Info className="h-4 w-4 text-brand-600" aria-hidden /> Comment c'est calculé, et à quel point s'y fier</h2>
                        <p className="text-sm">{d.expenditure.formula}</p>
                        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted">
                            {(d.reliability?.notes ?? []).map((n) => <li key={n}>{n}</li>)}
                            <li>{d.watch_energy.reason}</li>
                        </ul>
                    </Card>
                </>
            )}
        </div>
    );
}
