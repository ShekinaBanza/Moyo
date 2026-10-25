import { useState, type FormEvent } from 'react';
import { Trash2 } from 'lucide-react';
import { useJournal } from '@/hooks/useJournal';
import { ApiError } from '@/lib/api';
import { fmtDateTime, fmtNumber, localInputToIso, toLocalInput } from '@/lib/format';
import { Alert, Button, Card, ConfirmButton, EmptyState, ErrorState, Input, PageHeader, Select, Spinner, Textarea, useToast } from '@/components/ui';
import { OutboxPanel } from '@/components/OutboxPanel';
import type { BodyMeasurement } from '@/types';

const KIND: Record<string, string> = { weight: 'Poids', waist: 'Tour de taille', hip: 'Tour de hanches', chest: 'Tour de poitrine', arm: 'Tour de bras', thigh: 'Tour de cuisse' };

export default function Body() {
    const { items, loading, error, pending, create, remove, reload } = useJournal<BodyMeasurement>('body-measurements');
    const toast = useToast();
    const [kind, setKind] = useState('weight');
    const [value, setValue] = useState('');
    const [at, setAt] = useState(toLocalInput());
    const [notes, setNotes] = useState('');
    const [busy, setBusy] = useState(false);
    const [errs, setErrs] = useState<Record<string, string[]>>({});

    async function submit(e: FormEvent) {
        e.preventDefault();
        setBusy(true);
        setErrs({});
        try {
            const res = await create({ kind, value: Number(value.replace(',', '.')), measured_at: localInputToIso(at), notes: notes || null }, KIND[kind]);
            toast(res.status === 'synced' ? 'Mesure enregistrée.' : 'Hors ligne : brouillon gardé sur cet appareil, pas encore enregistré.', res.status === 'synced' ? 'ok' : 'warn');
            setValue('');
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
            <PageHeader title="Mesures corporelles" subtitle="Poids et tours de corps dans le temps." image="/images/illustrations/body.svg" />
            <OutboxPanel items={pending} />
            <Card aria-labelledby="new-body">
                <h2 id="new-body" className="mb-4 text-lg font-bold">Ajouter une mesure</h2>
                <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
                    <Select label="Mesure" value={kind} onChange={(e) => setKind(e.target.value)}>
                        {Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </Select>
                    <Input label={kind === 'weight' ? 'Valeur (kg)' : 'Valeur (cm)'} inputMode="decimal" required value={value} onChange={(e) => setValue(e.target.value)} error={errs.value?.[0]} />
                    <Input label="Date et heure de la mesure" type="datetime-local" required value={at} onChange={(e) => setAt(e.target.value)} />
                    <Textarea label="Commentaires (facultatif)" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} />
                    <div className="sm:col-span-2 flex justify-end"><Button type="submit" loading={busy}>Enregistrer</Button></div>
                </form>
            </Card>
            <Card aria-labelledby="hist-body">
                <h2 id="hist-body" className="mb-3 text-lg font-bold">Historique</h2>
                {loading ? <Spinner /> : error ? <ErrorState text={error} onRetry={() => void reload()} /> : items.length === 0 ? (
                    <EmptyState image="/images/illustrations/body.svg" title="Aucune mesure" text="Ajoutez votre poids ou votre tour de taille pour suivre leur évolution." />
                ) : (
                    <ul className="divide-y divide-sand-2">
                        {items.map((m) => (
                            <li key={m.id} className="flex items-start justify-between gap-3 py-3">
                                <div>
                                    <p className="font-semibold">{KIND[m.kind]} : {fmtNumber(m.value, m.unit)}</p>
                                    <p className="text-sm text-muted">{fmtDateTime(m.measured_at)}</p>
                                    {m.notes && <p className="text-sm">{m.notes}</p>}
                                </div>
                                <ConfirmButton variant="ghost" className="px-3" aria-label="Supprimer cette mesure" message="Supprimer définitivement cette mesure ?" onConfirm={async () => { await remove(m.id); toast('Mesure supprimée.'); }}><Trash2 className="h-4 w-4" aria-hidden /></ConfirmButton>
                            </li>
                        ))}
                    </ul>
                )}
            </Card>
            <Alert tone="info">Une variation de poids peut avoir de nombreuses causes (eau, repas, muscle, graisse…). Moyo ne les distingue pas à partir du seul poids ou du tour de taille.</Alert>
        </div>
    );
}
