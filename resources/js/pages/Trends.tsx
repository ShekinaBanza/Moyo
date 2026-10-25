import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { get, NetworkError } from '@/lib/api';
import { fmtDuration, fmtDate, minuteToClock, SYMPTOM_LABEL } from '@/lib/format';
import { Alert, Button, Card, ErrorState, Input, PageHeader, Spinner } from '@/components/ui';
import { ChartCard } from '@/components/Charts';
import type { Trends as TrendsT } from '@/types';

type Range = 'day' | 'week' | 'month' | 'custom';
const RANGE_LABEL: Record<Range, string> = { day: 'Jour', week: '7 jours', month: '30 jours', custom: 'Période libre' };

export default function Trends() {
    const [range, setRange] = useState<Range>('week');
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [data, setData] = useState<TrendsT | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (range === 'custom' && (!from || !to)) return;
        let alive = true;
        setLoading(true);
        const q = range === 'custom' ? `range=custom&from=${from}&to=${to}` : `range=${range}`;
        get<{ data: TrendsT }>(`/api/v1/trends?${q}`)
            .then((r) => alive && (setData(r.data), setError(null)))
            .catch((e) => alive && setError(e instanceof NetworkError ? 'Vous êtes hors ligne : les tendances ne sont pas disponibles.' : e.message))
            .finally(() => alive && setLoading(false));
        return () => {
            alive = false;
        };
    }, [range, from, to]);

    const period = data ? `${fmtDate(data.period.from)} → ${fmtDate(data.period.to)}` : '';
    const add = <Link to="/app/sleep" className="font-semibold text-brand-700 underline">Ajouter des données</Link>;
    const cmp = data?.comparison.sleep_avg_minutes;

    return (
        <div className="space-y-6">
            <PageHeader title="Tendances" subtitle="Évolution de vos propres données enregistrées. Une corrélation n'est pas une cause." image="/images/illustrations/habits.svg" />
            <div role="group" aria-label="Période" className="flex flex-wrap gap-2">
                {(Object.keys(RANGE_LABEL) as Range[]).map((r) => (
                    <Button key={r} variant={range === r ? 'primary' : 'secondary'} aria-pressed={range === r} onClick={() => setRange(r)}>{RANGE_LABEL[r]}</Button>
                ))}
            </div>
            {range === 'custom' && (
                <div className="grid gap-3 sm:grid-cols-2">
                    <Input label="Du" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                    <Input label="Au" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                </div>
            )}
            {loading ? <Spinner /> : error ? <ErrorState text={error} /> : data && (
                <div className="grid gap-4 lg:grid-cols-2">
                    <ChartCard title="Durée de sommeil" unit="heures" period={period} data={data.sleep.map((s) => ({ ...s, hours: +(s.sleep_minutes / 60).toFixed(2) }))} xKey="night" yKey="hours" formatX={fmtDate} formatY={(v) => `${v} h`} emptyText="Enregistrez vos nuits pour voir leur évolution." emptyAction={add} />
                    <Card>
                        <h3 className="font-bold">Régularité et comparaison du sommeil</h3>
                        <p className="mb-3 text-xs text-muted">Calculs descriptifs · {period}</p>
                        {data.sleep_regularity ? (
                            <p className="text-sm">Écart typique de l'heure de coucher : <strong>± {data.sleep_regularity.bedtime_sd_minutes} min</strong> sur {data.sleep_regularity.nights} nuits. {data.sleep.length > 0 && <>Coucher habituel : vers {minuteToClock(data.sleep[0].bed_minute_of_day)}.</>}</p>
                        ) : <p className="text-sm text-muted">Au moins 3 nuits sont nécessaires pour calculer la régularité.</p>}
                        <p className="mt-3 text-sm">Sommeil moyen : <strong>{fmtDuration(cmp?.current)}</strong> · période précédente : <strong>{fmtDuration(cmp?.previous)}</strong></p>
                        <p className="mt-3 text-xs text-muted">Aucun score global : les horaires, la durée et le ressenti sont présentés séparément.</p>
                    </Card>
                    <ChartCard title="Poids" unit="kg" period={period} kind="line" data={data.weight as never} xKey="at" yKey="value" formatX={(v) => fmtDate(v)} formatY={(v) => `${v} kg`} emptyText="Ajoutez vos pesées pour voir l'évolution." emptyAction={<Link to="/app/body" className="font-semibold text-brand-700 underline">Ajouter une mesure</Link>} />
                    <ChartCard title="Tour de taille" unit="cm" period={period} kind="line" data={data.waist as never} xKey="at" yKey="value" formatX={(v) => fmtDate(v)} formatY={(v) => `${v} cm`} emptyText="Ajoutez votre tour de taille pour suivre son évolution." emptyAction={<Link to="/app/body" className="font-semibold text-brand-700 underline">Ajouter une mesure</Link>} />
                    <ChartCard title="Pas par jour" unit="pas" period={period} data={data.activity as never} xKey="day" yKey="steps" formatX={fmtDate} formatY={(v) => v.toLocaleString('fr-FR')} emptyText="Aucun nombre de pas enregistré. Les pas ne sont jamais estimés." emptyAction={<Link to="/app/activity" className="font-semibold text-brand-700 underline">Noter une activité</Link>} />
                    <ChartCard title="Repas notés par jour" unit="repas" period={period} data={data.meals as never} xKey="day" yKey="count" formatX={fmtDate} emptyText="Notez vos repas pour voir votre fréquence." emptyAction={<Link to="/app/food" className="font-semibold text-brand-700 underline">Noter un repas</Link>} />
                    <ChartCard title="Intensité des symptômes" unit="/10" period={period} kind="line" data={data.symptoms.map((s) => ({ ...s, label: SYMPTOM_LABEL[s.type] })) as never} xKey="at" yKey="intensity" formatX={fmtDate} yDomain={[0, 10]} emptyText="Aucun symptôme noté sur cette période." emptyAction={<Link to="/app/symptoms" className="font-semibold text-brand-700 underline">Noter un symptôme</Link>} />
                </div>
            )}
            <Alert tone="info">Les tendances montrent ce que vous avez noté. Elles ne remplacent pas un avis médical.</Alert>
        </div>
    );
}
