import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { get, NetworkError } from '@/lib/api';
import { fmtDate, fmtKcal, fmtSigned } from '@/lib/format';
import { Alert, Badge, Button, Card, ErrorState, Input, PageHeader, Spinner } from '@/components/ui';
import type { EnergyHistory as H } from '@/types';

type Range = 'week' | 'month' | 'custom';
const LABEL: Record<Range, string> = { week: '7 jours', month: '30 jours', custom: 'Période libre' };

export default function EnergyHistory() {
    const [range, setRange] = useState<Range>('week');
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [h, setH] = useState<H | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (range === 'custom' && (!from || !to)) return;
        let alive = true;
        setH(null);
        const q = range === 'custom' ? `range=custom&from=${from}&to=${to}` : `range=${range}`;
        get<{ data: H }>(`/api/v1/energy/history?${q}`)
            .then((r) => alive && (setH(r.data), setError(null)))
            .catch((e) => alive && setError(e instanceof NetworkError ? 'Vous êtes hors ligne : historique indisponible.' : e.message));
        return () => {
            alive = false;
        };
    }, [range, from, to]);

    return (
        <div className="space-y-5">
            <PageHeader title="Historique des bilans" subtitle="Jour par jour, uniquement pour les jours où un bilan est calculable." image="/images/illustrations/habits.svg" action={<Link to="/app/energy" className="text-sm font-semibold text-brand-700 underline">← Mon bilan du jour</Link>} />
            <div role="group" aria-label="Période" className="flex flex-wrap gap-2">
                {(Object.keys(LABEL) as Range[]).map((r) => <Button key={r} variant={range === r ? 'primary' : 'secondary'} aria-pressed={range === r} onClick={() => setRange(r)}>{LABEL[r]}</Button>)}
            </div>
            {range === 'custom' && <div className="grid gap-3 sm:grid-cols-2"><Input label="Du" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /><Input label="Au" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>}

            {error ? <ErrorState text={error} /> : !h ? <Spinner /> : (
                <>
                    <Card>
                        <h2 className="font-bold">Bilan énergétique estimé par jour</h2>
                        <p className="mb-3 text-xs text-muted">kcal · {fmtDate(h.period.from)} → {fmtDate(h.period.to)}. Un jour sans barre = bilan non calculable (données manquantes), pas un bilan nul.</p>
                        {h.summary.days_with_balance === 0 ? (
                            <p className="py-6 text-center text-sm text-muted">Aucun bilan calculable sur cette période. Il faut des repas avec valeur calorique <em>et</em> un profil complet (sexe, naissance, taille, poids).</p>
                        ) : (
                            <div className="h-56" role="img" aria-label={`Bilan par jour sur ${h.days.length} jours, ${h.summary.days_with_balance} calculables`}>
                                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                                    <BarChart data={h.days} margin={{ top: 4, right: 4, left: -12, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                                        <XAxis dataKey="date" tickFormatter={(v: string) => v.slice(8)} tick={{ fontSize: 11 }} minTickGap={12} />
                                        <YAxis tick={{ fontSize: 11 }} width={48} />
                                        <ReferenceLine y={0} stroke="#64748b" />
                                        <Tooltip formatter={(v) => [fmtSigned(Number(v)), 'Bilan estimé']} labelFormatter={(l) => fmtDate(String(l))} />
                                        <Bar dataKey="balance_kcal" radius={[4, 4, 4, 4]}>
                                            {h.days.map((d) => <Cell key={d.date} fill={d.complete ? '#0f766e' : '#94a3b8'} />)}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                        <p className="mt-2 text-xs text-muted">Foncé : bilan complet · gris : bilan partiel (repas ou activités sans valeur, ou journée en cours).</p>
                    </Card>
                    <Card>
                        <h2 className="mb-3 font-bold">Détail</h2>
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[28rem] text-left text-sm">
                                <caption className="sr-only">Détail des bilans par jour</caption>
                                <thead><tr className="text-xs text-muted"><th scope="col" className="py-1">Jour</th><th scope="col">Consommées</th><th scope="col">Dépensées</th><th scope="col">Bilan</th></tr></thead>
                                <tbody className="divide-y divide-sand-2">
                                    {[...h.days].reverse().map((d) => (
                                        <tr key={d.date}>
                                            <th scope="row" className="py-2 font-medium"><Link to={`/app/energy?date=${d.date}`} className="underline">{fmtDate(d.date)}</Link></th>
                                            <td>{fmtKcal(d.consumed_kcal)}</td><td>{fmtKcal(d.expenditure_kcal)}</td>
                                            <td className="font-semibold">{fmtSigned(d.balance_kcal)} {d.balance_kcal !== null && !d.complete && <Badge tone="warn">partiel</Badge>}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <p className="mt-3 text-sm">Moyenne des bilans calculables : <strong>{fmtSigned(h.summary.avg_balance_kcal)}</strong> sur {h.summary.days_with_balance} jour(s). <span className="text-muted">{h.summary.note}</span></p>
                    </Card>
                    <Alert tone="info">Ces bilans sont des estimations. Une variation de poids ne se déduit pas directement d'un bilan calorique.</Alert>
                </>
            )}
        </div>
    );
}
