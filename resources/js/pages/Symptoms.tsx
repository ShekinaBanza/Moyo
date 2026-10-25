import { useEffect, useState, type FormEvent } from 'react';
import { Printer, Trash2 } from 'lucide-react';
import { useJournal } from '@/hooks/useJournal';
import { ApiError, get } from '@/lib/api';
import { fmtDateTime, fmtDuration, localInputToIso, SYMPTOM_LABEL, toLocalInput } from '@/lib/format';
import { Badge, Button, Card, ConfirmButton, EmptyState, ErrorState, Input, PageHeader, Select, Spinner, Textarea, useToast } from '@/components/ui';
import { OutboxPanel } from '@/components/OutboxPanel';
import { SafetyBanner } from '@/components/SafetyBanner';
import type { SafetyStatus, SymptomEntry } from '@/types';

const TREND: Record<string, string> = { better: 'Mieux', same: 'Stable', worse: "S'aggrave" };

export default function Symptoms() {
    const { items, loading, error, pending, create, remove, reload } = useJournal<SymptomEntry>('symptoms');
    const toast = useToast();
    const [safety, setSafety] = useState<SafetyStatus | null>(null);
    const [type, setType] = useState('fatigue');
    const [label, setLabel] = useState('');
    const [at, setAt] = useState(toLocalInput());
    const [intensity, setIntensity] = useState(3);
    const [dur, setDur] = useState('');
    const [atRest, setAtRest] = useState(false);
    const [context, setContext] = useState('');
    const [activity, setActivity] = useState('');
    const [trend, setTrend] = useState('');
    const [notes, setNotes] = useState('');
    const [busy, setBusy] = useState(false);
    const [errs, setErrs] = useState<Record<string, string[]>>({});

    useEffect(() => {
        get<{ data: SafetyStatus }>('/api/v1/safety-status').then((r) => setSafety(r.data)).catch(() => undefined);
    }, []);

    async function submit(e: FormEvent) {
        e.preventDefault();
        setBusy(true);
        setErrs({});
        try {
            const res = await create(
                { symptom_type: type, custom_label: type === 'other' ? label || null : null, occurred_at: localInputToIso(at), intensity, duration_minutes: dur === '' ? null : Number(dur), at_rest: atRest, context: context || null, activity: activity || null, trend: trend || null, notes: notes || null },
                SYMPTOM_LABEL[type],
            );
            if (res.status === 'synced') {
                toast('Symptôme enregistré.');
                // the server answers with the safety decision on every symptom write
                setSafety((await get<{ data: SafetyStatus }>('/api/v1/safety-status')).data);
            } else {
                toast("Hors ligne : brouillon gardé sur cet appareil. Si vous avez un symptôme d'alerte, n'attendez pas : cherchez une aide médicale.", 'warn');
            }
            setNotes('');
        } catch (e) {
            if (e instanceof ApiError) setErrs(e.errors);
            toast(e instanceof ApiError ? e.message : 'Enregistrement impossible.', 'danger');
        } finally {
            setBusy(false);
        }
    }

    const alertType = type === 'chest_pain' || type === 'fainting' || (type === 'breathlessness' && atRest && intensity >= 7);

    return (
        <div className="space-y-6">
            <PageHeader title="Symptômes" subtitle="Un historique clair à présenter à un professionnel de santé. Moyo ne pose aucun diagnostic." image="/images/illustrations/wellbeing.svg" />
            <SafetyBanner safety={safety} />
            <OutboxPanel items={pending} />

            <Card aria-labelledby="new-sym">
                <h2 id="new-sym" className="mb-4 text-lg font-bold">Noter un symptôme</h2>
                <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
                    <Select label="Symptôme" value={type} onChange={(e) => setType(e.target.value)}>
                        {Object.entries(SYMPTOM_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </Select>
                    {type === 'other' ? <Input label="Précisez" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={120} /> : <div />}
                    <Input label="Date et heure" type="datetime-local" required value={at} onChange={(e) => setAt(e.target.value)} />
                    <div>
                        <label htmlFor="intensity" className="mb-1 block text-sm font-medium">Intensité ressentie : <strong>{intensity}/10</strong></label>
                        <input id="intensity" type="range" min={0} max={10} value={intensity} onChange={(e) => setIntensity(Number(e.target.value))} className="h-11 w-full accent-brand-600" aria-valuetext={`${intensity} sur 10`} />
                        <p className="flex justify-between text-xs text-muted"><span>0 = aucune</span><span>10 = insupportable</span></p>
                    </div>
                    <Input label="Durée en minutes (facultatif)" type="number" min={0} value={dur} onChange={(e) => setDur(e.target.value)} />
                    <Select label="Évolution (facultatif)" value={trend} onChange={(e) => setTrend(e.target.value)}>
                        <option value="">—</option><option value="better">Mieux</option><option value="same">Stable</option><option value="worse">S'aggrave</option>
                    </Select>
                    <label className="flex min-h-11 items-center gap-3 text-sm sm:col-span-2">
                        <input type="checkbox" className="h-5 w-5" checked={atRest} onChange={(e) => setAtRest(e.target.checked)} /> Ce symptôme est présent <strong>au repos</strong>
                    </label>
                    <Input label="Activité en cours (facultatif)" value={activity} onChange={(e) => setActivity(e.target.value)} placeholder="Ex. montée d'escaliers, marche rapide" maxLength={255} />
                    <Input label="Contexte (facultatif)" value={context} onChange={(e) => setContext(e.target.value)} placeholder="Ex. après le repas, le soir" maxLength={255} />
                    <div className="sm:col-span-2"><Textarea label="Commentaires (facultatif)" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} error={errs.notes?.[0]} /></div>
                    {alertType && (
                        <p role="alert" className="sm:col-span-2 rounded-2xl border border-red-300 bg-red-50 p-3 text-sm font-semibold text-red-900">
                            Ce type de symptôme peut être grave. Cherchez une aide médicale urgente maintenant : n'attendez pas d'avoir enregistré cette entrée.
                        </p>
                    )}
                    <div className="sm:col-span-2 flex justify-end"><Button type="submit" loading={busy}>Enregistrer</Button></div>
                </form>
            </Card>

            <Card aria-labelledby="hist-sym">
                <div className="mb-3 flex items-center justify-between gap-2">
                    <h2 id="hist-sym" className="text-lg font-bold">Historique</h2>
                    {items.length > 0 && <Button variant="secondary" className="print:hidden" onClick={() => window.print()}><Printer className="h-4 w-4" aria-hidden /> Imprimer / PDF</Button>}
                </div>
                {loading ? <Spinner /> : error ? <ErrorState text={error} onRetry={() => void reload()} /> : items.length === 0 ? (
                    <EmptyState image="/images/illustrations/wellbeing.svg" title="Aucun symptôme noté" text="Tant mieux. Si quelque chose apparaît, notez-le ici avec l'heure et le contexte." />
                ) : (
                    <ul className="divide-y divide-sand-2">
                        {items.map((s) => (
                            <li key={s.id} className="flex items-start justify-between gap-3 py-3">
                                <div>
                                    <p className="font-semibold">{s.symptom_type === 'other' && s.custom_label ? s.custom_label : SYMPTOM_LABEL[s.symptom_type]} <span className="font-normal text-muted">· {fmtDateTime(s.occurred_at)}</span></p>
                                    <p className="mt-1 flex flex-wrap gap-2 text-sm text-muted">
                                        <Badge tone={s.intensity >= 7 ? 'danger' : s.intensity >= 4 ? 'warn' : 'neutral'}>Intensité {s.intensity}/10</Badge>
                                        {s.at_rest && <Badge tone="warn">Au repos</Badge>}
                                        {s.duration_minutes !== null && <span>Durée {fmtDuration(s.duration_minutes)}</span>}
                                        {s.trend && <span>{TREND[s.trend]}</span>}
                                    </p>
                                    {(s.activity || s.context) && <p className="mt-1 text-sm">{[s.activity, s.context].filter(Boolean).join(' · ')}</p>}
                                    {s.notes && <p className="mt-1 text-sm">{s.notes}</p>}
                                </div>
                                <ConfirmButton variant="ghost" className="px-3 print:hidden" aria-label="Supprimer ce symptôme" message="Supprimer définitivement cette entrée ?" onConfirm={async () => { await remove(s.id); toast('Entrée supprimée.'); }}><Trash2 className="h-4 w-4" aria-hidden /></ConfirmButton>
                            </li>
                        ))}
                    </ul>
                )}
            </Card>
        </div>
    );
}
