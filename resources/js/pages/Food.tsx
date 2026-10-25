import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Pencil, Trash2 } from 'lucide-react';
import { useJournal } from '@/hooks/useJournal';
import { ApiError, get } from '@/lib/api';
import { fmtDateTime, localInputToIso, MEAL_LABEL, NUTRITION_LABEL, toLocalInput, UNIT_LABEL } from '@/lib/format';
import { submitEntry } from '@/lib/offline';
import { Alert, Badge, Button, Card, ConfirmButton, EmptyState, ErrorState, Input, Modal, PageHeader, Select, Spinner, Textarea, useToast } from '@/components/ui';
import { OutboxPanel } from '@/components/OutboxPanel';
import type { FoodCatalogItem, FoodEntry } from '@/types';

const guessMeal = () => {
    const h = new Date().getHours();
    return h < 10 ? 'breakfast' : h < 15 ? 'lunch' : h < 18 ? 'snack' : 'dinner';
};

interface FormProps {
    catalog: FoodCatalogItem[];
    entry?: FoodEntry | null;
    onSaved(): void;
    onUpdate?(id: number, body: Record<string, unknown>): Promise<unknown>;
    onCancel?(): void;
}

function FoodForm({ catalog, entry, onSaved, onUpdate, onCancel }: FormProps) {
    const toast = useToast();
    const [name, setName] = useState(entry?.name ?? '');
    const [catalogId, setCatalogId] = useState<number | null>(entry?.catalog_id ?? null);
    const [meal, setMeal] = useState(entry?.meal_type ?? guessMeal());
    const [at, setAt] = useState(entry ? toLocalInput(new Date(entry.eaten_at)) : toLocalInput());
    const [unit, setUnit] = useState(entry?.unit ?? 'medium');
    const [qty, setQty] = useState(entry?.quantity?.toString() ?? '1');
    const [feeling, setFeeling] = useState(entry?.feeling_after ?? '');
    const [notes, setNotes] = useState(entry?.notes ?? '');
    const [kcal, setKcal] = useState(entry?.kcal?.toString() ?? '');
    const [status, setStatus] = useState<'estimated' | 'verified'>(entry?.nutrition_status === 'verified' ? 'verified' : 'estimated');
    const [source, setSource] = useState('');
    const [busy, setBusy] = useState(false);
    const [errs, setErrs] = useState<Record<string, string[]>>({});

    const item = catalog.find((c) => c.id === catalogId) ?? null;
    const q = Number(qty.replace(',', '.'));
    const hint = item?.portion_kcal && ['small', 'medium', 'large'].includes(unit) && q > 0 ? Math.round(item.portion_kcal[unit as 'small' | 'medium' | 'large'] * q) : null;

    async function submit(e: FormEvent) {
        e.preventDefault();
        setBusy(true);
        setErrs({});
        const hasKcal = kcal.trim() !== '';
        const body: Record<string, unknown> = {
            name, catalog_id: catalogId, meal_type: meal, eaten_at: localInputToIso(at), unit,
            quantity: qty === '' ? null : q, feeling_after: feeling || null, notes: notes || null,
            kcal: hasKcal ? Number(kcal.replace(',', '.')) : null,
            nutrition_status: hasKcal ? status : 'unknown',
            nutrition_source: hasKcal ? source || (status === 'verified' ? 'Saisie utilisateur (valeur vérifiée)' : 'Saisie utilisateur (valeur estimée)') : null,
        };
        try {
            if (entry && onUpdate) {
                await onUpdate(entry.id, body);
                toast('Repas modifié. Le bilan est recalculé.');
            } else {
                const res = await submitEntry('/api/v1/food-entries', body, name);
                toast(res.status === 'synced' ? 'Repas enregistré.' : 'Hors ligne : brouillon gardé sur cet appareil, pas encore enregistré.', res.status === 'synced' ? 'ok' : 'warn');
                setName(''); setCatalogId(null); setNotes(''); setKcal(''); setSource('');
            }
            onSaved();
        } catch (err) {
            if (err instanceof ApiError) setErrs(err.errors);
            toast(err instanceof ApiError ? err.message : 'Enregistrement impossible.', 'danger');
        } finally {
            setBusy(false);
        }
    }

    return (
        <form onSubmit={submit} className="space-y-4">
            {!entry && (
                <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6" aria-label="Aliments courants">
                    {catalog.map((c) => (
                        <li key={c.id}>
                            <button type="button" onClick={() => { setCatalogId(c.id); setName(c.name); setKcal(''); setSource(''); }} aria-pressed={catalogId === c.id} className={`flex w-full flex-col items-center gap-1 rounded-2xl border p-2 text-center text-xs font-medium ${catalogId === c.id ? 'border-brand-600 bg-brand-50' : 'border-sand-2 bg-white hover:bg-brand-50'}`}>
                                <img src={`/images/foods/${c.image ?? 'sauce'}.svg`} alt="" width={64} height={64} loading="lazy" className="h-16 w-16" />
                                <span className="line-clamp-2">{c.name}</span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2"><Input label="Aliment ou plat" required value={name} onChange={(e) => { setName(e.target.value); if (!entry) setCatalogId(null); }} placeholder="Ex. foufou, sauce de poisson, riz et haricots" error={errs.name?.[0]} /></div>
                <Select label="Type de repas" value={meal} onChange={(e) => setMeal(e.target.value)}>{Object.entries(MEAL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
                <Input label="Date et heure" type="datetime-local" required value={at} onChange={(e) => setAt(e.target.value)} />
                <Select label="Portion" value={unit} onChange={(e) => setUnit(e.target.value)}>{Object.entries(UNIT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
                <Input label="Quantité" type="number" min={0} step="0.5" value={qty} onChange={(e) => setQty(e.target.value)} hint="Ex. 1 portion moyenne, 200 g, 2 pièces." />
                <Select label="Ressenti après le repas (facultatif)" value={feeling} onChange={(e) => setFeeling(e.target.value)}>
                    <option value="">—</option><option value="good">Bien</option><option value="neutral">Neutre</option><option value="heavy">Lourd</option>
                    <option value="bloated">Ballonné</option><option value="nauseous">Nausée</option><option value="tired">Fatigué</option>
                </Select>
                <Textarea label="Commentaires (facultatif)" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} />
            </div>

            <fieldset className="space-y-3 rounded-2xl bg-sand p-4">
                <legend className="px-1 text-sm font-semibold">Calories (facultatif)</legend>
                {hint !== null && kcal === '' && (
                    <div className="flex flex-wrap items-center gap-3 text-sm">
                        <span>Ordre de grandeur pour cette portion : <strong>≈ {hint} kcal</strong> <span className="text-muted">(indicatif, varie selon la recette)</span></span>
                        <Button type="button" variant="secondary" className="min-h-9 px-3" onClick={() => { setKcal(String(hint)); setStatus('estimated'); setSource(item?.portion_kcal_source ?? 'Estimation indicative du catalogue'); }}>Utiliser cette estimation</Button>
                    </div>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                    <Input label="Calories de ce repas (kcal)" type="number" min={0} max={10000} value={kcal} onChange={(e) => setKcal(e.target.value)} error={errs.kcal?.[0]} hint="Laissez vide si vous ne savez pas : la valeur restera « inconnue » et ne sera pas comptée." />
                    <Select label="Nature de cette valeur" value={status} onChange={(e) => setStatus(e.target.value as 'estimated' | 'verified')} disabled={kcal.trim() === ''}>
                        <option value="estimated">Valeur estimée (à peu près)</option>
                        <option value="verified">Valeur vérifiée (emballage, étiquette, table officielle)</option>
                    </Select>
                </div>
                {kcal.trim() !== '' && source && <p className="text-xs text-muted">Source : {source}</p>}
            </fieldset>

            <div className="flex flex-wrap justify-end gap-2">
                {onCancel && <Button type="button" variant="secondary" onClick={onCancel}>Annuler</Button>}
                <Button type="submit" loading={busy}>{entry ? 'Enregistrer les modifications' : 'Enregistrer'}</Button>
            </div>
        </form>
    );
}

export default function Food() {
    const { items, loading, error, pending, update, remove, reload } = useJournal<FoodEntry>('food-entries');
    const toast = useToast();
    const [catalog, setCatalog] = useState<FoodCatalogItem[]>([]);
    const [editing, setEditing] = useState<FoodEntry | null>(null);

    useEffect(() => {
        get<{ data: FoodCatalogItem[] }>('/api/v1/food-catalog').then((r) => setCatalog(r.data)).catch(() => undefined);
    }, []);

    return (
        <div className="space-y-6">
            <PageHeader title="Alimentation" subtitle="Observez vos repas sans culpabilité. Aucun aliment de base n'est interdit." image="/images/foods/foufou.svg"
                action={<Link to="/app/energy" className="text-sm font-semibold text-brand-700 underline">Voir mon bilan énergétique</Link>} />
            <OutboxPanel items={pending} />

            <Card aria-labelledby="new-food">
                <h2 id="new-food" className="mb-4 text-lg font-bold">Enregistrer un repas ou une boisson</h2>
                <FoodForm catalog={catalog} onSaved={() => void reload()} />
                <p className="mt-3 text-xs text-muted">Les calories ne sont jamais inventées : sans valeur saisie ou estimation choisie par vous, le repas reste « valeur inconnue ».</p>
            </Card>

            <Card aria-labelledby="hist-food">
                <h2 id="hist-food" className="mb-3 text-lg font-bold">Derniers repas</h2>
                {loading ? <Spinner /> : error ? <ErrorState text={error} onRetry={() => void reload()} /> : items.length === 0 ? (
                    <EmptyState image="/images/foods/riz.svg" title="Aucun repas enregistré" text="Choisissez un aliment ci-dessus pour noter votre premier repas." />
                ) : (
                    <ul className="divide-y divide-sand-2">
                        {items.map((f) => (
                            <li key={f.id} className="flex items-start justify-between gap-3 py-3">
                                <div className="min-w-0">
                                    <p className="font-semibold">{f.name}</p>
                                    <p className="text-sm text-muted">{MEAL_LABEL[f.meal_type]} · {fmtDateTime(f.eaten_at)} · {f.quantity ?? ''} {f.unit ? UNIT_LABEL[f.unit] : ''}</p>
                                    <p className="mt-1 flex flex-wrap gap-2"><Badge tone={f.nutrition_status === 'unknown' ? 'neutral' : f.nutrition_status === 'estimated' ? 'warn' : 'ok'}>{NUTRITION_LABEL[f.nutrition_status]}</Badge>{f.kcal !== null && <Badge tone="info">≈ {f.kcal} kcal</Badge>}</p>
                                    {f.notes && <p className="mt-1 text-sm">{f.notes}</p>}
                                </div>
                                <div className="flex shrink-0">
                                    <Button variant="ghost" className="px-3" aria-label={`Modifier ${f.name}`} onClick={() => setEditing(f)}><Pencil className="h-4 w-4" aria-hidden /></Button>
                                    <ConfirmButton variant="ghost" className="px-3" aria-label={`Supprimer ${f.name}`} message="Supprimer définitivement ce repas ? Le bilan sera recalculé." onConfirm={async () => { await remove(f.id); toast('Repas supprimé.'); }}><Trash2 className="h-4 w-4" aria-hidden /></ConfirmButton>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </Card>
            <Alert tone="info">Une seule observation ne prouve pas qu'un aliment cause un symptôme. Gardez un historique et parlez-en à un professionnel de santé.</Alert>

            <Modal open={editing !== null} onClose={() => setEditing(null)} title="Corriger ce repas">
                {editing && <FoodForm catalog={catalog} entry={editing} onUpdate={update} onSaved={() => setEditing(null)} onCancel={() => setEditing(null)} />}
            </Modal>
        </div>
    );
}
