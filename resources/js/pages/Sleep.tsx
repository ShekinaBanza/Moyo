import { useState, type FormEvent } from 'react';
import { Moon, Trash2 } from 'lucide-react';
import { useJournal } from '@/hooks/useJournal';
import { ApiError } from '@/lib/api';
import { fmtDate, fmtDateTime, fmtDuration, localDate, localInputToIso, toLocalInput } from '@/lib/format';
import { Alert, Button, Card, ConfirmButton, EmptyState, ErrorState, Input, PageHeader, Rating, SourceBadge, Spinner, Textarea, useToast } from '@/components/ui';
import { OutboxPanel } from '@/components/OutboxPanel';
import type { SleepRecord } from '@/types';

const yesterdayEvening = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    d.setHours(22, 30, 0, 0);
    return toLocalInput(d);
};
const thisMorning = () => {
    const d = new Date();
    d.setHours(6, 30, 0, 0);
    return toLocalInput(d);
};

export default function Sleep() {
    const { items, loading, error, pending, create, remove, reload } = useJournal<SleepRecord>('sleep-records');
    const toast = useToast();
    const [bed, setBed] = useState(yesterdayEvening());
    const [onset, setOnset] = useState('');
    const [wake, setWake] = useState(thisMorning());
    const [awakenings, setAwakenings] = useState('');
    const [awakeMin, setAwakeMin] = useState('');
    const [quality, setQuality] = useState<number | null>(null);
    const [energy, setEnergy] = useState<number | null>(null);
    const [notes, setNotes] = useState('');
    const [busy, setBusy] = useState(false);
    const [errs, setErrs] = useState<Record<string, string[]>>({});

    // Live preview of the two different durations (same rule as the server).
    const inBed = (new Date(wake).getTime() - new Date(bed).getTime()) / 60000;
    const asleep = inBed - (onset ? (new Date(onset).getTime() - new Date(bed).getTime()) / 60000 : 0) - (Number(awakeMin) || 0);
    const previewOk = inBed > 0 && inBed <= 1440 && asleep > 0;

    async function submit(e: FormEvent) {
        e.preventDefault();
        setBusy(true);
        setErrs({});
        try {
            const res = await create(
                {
                    night_date: localDate(new Date(wake)),
                    bedtime: localInputToIso(bed),
                    sleep_onset_at: onset ? localInputToIso(onset) : null,
                    wake_time: localInputToIso(wake),
                    night_awakenings: awakenings === '' ? null : Number(awakenings),
                    awake_minutes: awakeMin === '' ? null : Number(awakeMin),
                    quality,
                    morning_energy: energy,
                    notes: notes || null,
                    source_type: 'manual',
                },
                'Nuit de sommeil',
            );
            toast(res.status === 'synced' ? 'Nuit enregistrée.' : 'Hors ligne : brouillon gardé sur cet appareil, pas encore enregistré.', res.status === 'synced' ? 'ok' : 'warn');
            setNotes('');
        } catch (e) {
            if (e instanceof ApiError) setErrs(e.errors);
            toast(e instanceof ApiError ? e.message : 'Enregistrement impossible.', 'danger');
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="space-y-6">
            <PageHeader title="Sommeil" subtitle="Notez vos nuits : durée, réveils et ressenti. Le temps au lit et le sommeil estimé sont distincts." image="/images/illustrations/sleep.svg" />
            <OutboxPanel items={pending} />

            <Card aria-labelledby="new-sleep">
                <h2 id="new-sleep" className="mb-4 flex items-center gap-2 text-lg font-bold"><Moon className="h-5 w-5 text-brand-600" aria-hidden /> Enregistrer une nuit</h2>
                <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
                    <Input label="Heure du coucher" type="datetime-local" required value={bed} onChange={(e) => setBed(e.target.value)} />
                    <Input label="Endormissement approximatif (facultatif)" type="datetime-local" value={onset} onChange={(e) => setOnset(e.target.value)} />
                    <Input label="Heure du réveil" type="datetime-local" required value={wake} onChange={(e) => setWake(e.target.value)} error={errs.wake_time?.[0]} />
                    <Input label="Nombre de réveils nocturnes (facultatif)" type="number" min={0} max={50} value={awakenings} onChange={(e) => setAwakenings(e.target.value)} />
                    <Input label="Temps éveillé la nuit, en minutes (facultatif)" type="number" min={0} max={1440} value={awakeMin} onChange={(e) => setAwakeMin(e.target.value)} />
                    <div className="sm:col-span-2 grid gap-4 sm:grid-cols-2">
                        <Rating label="Qualité perçue du sommeil" value={quality} onChange={setQuality} lowText="1 = très mauvaise" highText="5 = très bonne" />
                        <Rating label="Énergie au réveil" value={energy} onChange={setEnergy} lowText="1 = épuisé" highText="5 = en forme" />
                    </div>
                    <div className="sm:col-span-2"><Textarea label="Commentaires (facultatif)" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} /></div>
                    <div className="sm:col-span-2 flex flex-wrap items-center justify-between gap-3">
                        <p className="text-sm text-muted" aria-live="polite">
                            {previewOk ? <>Au lit : <strong>{fmtDuration(inBed)}</strong> · Sommeil estimé : <strong>{fmtDuration(asleep)}</strong></> : 'Vérifiez vos horaires : le réveil doit suivre le coucher.'}
                        </p>
                        <Button type="submit" loading={busy} disabled={!previewOk}>Enregistrer</Button>
                    </div>
                </form>
            </Card>

            <Card aria-labelledby="hist-sleep">
                <h2 id="hist-sleep" className="mb-3 text-lg font-bold">Historique</h2>
                {loading ? <Spinner /> : error ? <ErrorState text={error} onRetry={() => void reload()} /> : items.length === 0 ? (
                    <EmptyState image="/images/illustrations/first-use.svg" title="Aucune nuit enregistrée" text="Ajoutez votre dernière nuit pour commencer à voir votre régularité." />
                ) : (
                    <ul className="divide-y divide-sand-2">
                        {items.map((s) => (
                            <li key={s.id} className="flex items-start justify-between gap-3 py-3">
                                <div className="min-w-0">
                                    <p className="font-semibold">{fmtDate(s.night_date)} · {fmtDuration(s.sleep_minutes)} de sommeil</p>
                                    <p className="text-sm text-muted">Au lit {fmtDuration(s.time_in_bed_minutes)} · {fmtDateTime(s.bedtime)} → {fmtDateTime(s.wake_time)}</p>
                                    <p className="mt-1 flex flex-wrap gap-2 text-xs text-muted">
                                        <SourceBadge source={s.source_type} />
                                        {s.quality && <span>Qualité {s.quality}/5</span>}
                                        {s.morning_energy && <span>Énergie {s.morning_energy}/5</span>}
                                        {s.night_awakenings !== null && <span>{s.night_awakenings} réveil(s)</span>}
                                    </p>
                                    {s.notes && <p className="mt-1 text-sm">{s.notes}</p>}
                                </div>
                                <ConfirmButton variant="ghost" className="px-3" aria-label="Supprimer cette nuit" message="Supprimer définitivement cette nuit de sommeil ?" onConfirm={async () => { await remove(s.id); toast('Nuit supprimée.'); }}>
                                    <Trash2 className="h-4 w-4" aria-hidden />
                                </ConfirmButton>
                            </li>
                        ))}
                    </ul>
                )}
            </Card>
            <Alert tone="info">Les phases de sommeil (léger, profond, paradoxal) ne sont affichées que si une source réelle les fournit.</Alert>
        </div>
    );
}
