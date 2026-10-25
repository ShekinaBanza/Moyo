import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Pencil, Trash2 } from 'lucide-react';
import { useJournal } from '@/hooks/useJournal';
import { get } from '@/lib/api';
import { ACTIVITY_LABEL, fmtDateTime, fmtDuration, fmtKcal, fmtNumber, NA, QUALITY_LABEL } from '@/lib/format';
import { Alert, Badge, Button, Card, ConfirmButton, EmptyState, ErrorState, Modal, PageHeader, SourceBadge, Spinner, useToast } from '@/components/ui';
import { OutboxPanel } from '@/components/OutboxPanel';
import { SafetyBanner } from '@/components/SafetyBanner';
import { ActivityForm, activityIcon, useActivityCatalog } from '@/components/ActivityForm';
import type { ActivityEntryFull, SafetyStatus } from '@/types';

export default function Activity() {
    const { items, loading, error, pending, update, remove, reload } = useJournal<ActivityEntryFull>('activity-entries');
    const catalog = useActivityCatalog();
    const toast = useToast();
    const [safety, setSafety] = useState<SafetyStatus | null>(null);
    const [editing, setEditing] = useState<ActivityEntryFull | null>(null);

    useEffect(() => {
        get<{ data: SafetyStatus }>('/api/v1/safety-status').then((r) => setSafety(r.data)).catch(() => undefined);
    }, [items.length]);

    return (
        <div className="space-y-6">
            <PageHeader title="Activité" subtitle="Choisissez ce que vous avez fait : la dépense est estimée à partir de la durée, de votre poids et de l'activité." image="/images/illustrations/activity.svg"
                action={<div className="flex flex-wrap gap-3 text-sm font-semibold text-brand-700"><Link className="underline" to="/app/day">Ma journée</Link><Link className="underline" to="/app/exercises">Exercices physiques</Link><Link className="underline" to="/app/map">Carte et déplacements</Link><Link className="underline" to="/app/energy">Mon bilan énergétique</Link></div>} />
            <SafetyBanner safety={safety} compact />
            {safety && !safety.activity_progression_allowed && (
                <Alert tone="warn" title="Pas d'augmentation d'intensité proposée">
                    <p>Tant que les signes d'alerte notés ne sont pas évalués par un professionnel de santé, Moyo ne propose pas de nouveaux objectifs plus exigeants. Gardez une activité douce et arrêtez-vous si les symptômes apparaissent.</p>
                </Alert>
            )}
            <OutboxPanel items={pending} />

            <Card aria-labelledby="new-act">
                <h2 id="new-act" className="mb-4 text-lg font-bold">Ajouter une activité</h2>
                <ActivityForm catalog={catalog} onSaved={() => void reload()} />
            </Card>

            <Card aria-labelledby="hist-act">
                <h2 id="hist-act" className="mb-3 text-lg font-bold">Historique</h2>
                {loading ? <Spinner /> : error ? <ErrorState text={error} onRetry={() => void reload()} /> : items.length === 0 ? (
                    <EmptyState image="/images/illustrations/first-use.svg" title="Aucune activité enregistrée" text="Choisissez une activité ci-dessus pour commencer. Vous pouvez en ajouter plusieurs dans la même journée." />
                ) : (
                    <ul className="divide-y divide-sand-2">
                        {items.map((a) => {
                            const cat = catalog.find((c) => c.id === a.catalog_id);
                            const est = a.estimate;
                            return (
                                <li key={a.id} className="flex items-start gap-3 py-3">
                                    <img src={activityIcon(cat?.icon ?? 'other')} alt="" width={44} height={44} loading="lazy" className="h-11 w-11 shrink-0" />
                                    <div className="min-w-0 flex-1">
                                        <p className="font-semibold">{a.custom_label || cat?.name || ACTIVITY_LABEL[a.activity_type]} <span className="font-normal text-muted">· {fmtDateTime(a.started_at)}</span></p>
                                        <p className="text-sm text-muted">Durée : {fmtDuration(a.duration_minutes)} · Distance : {a.distance_km !== null ? `${fmtNumber(a.distance_km, 'km')} (${a.distance_source === 'gps' ? 'GPS' : a.distance_source === 'watch' ? 'montre' : 'saisie'})` : NA} · Pas : {fmtNumber(a.steps)}{a.perceived_effort ? ` · Effort ${a.perceived_effort}/10` : ''}</p>
                                        <p className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                                            <SourceBadge source={a.source_type === 'gps' ? 'gps' : a.source_type} />
                                            {est && est.quality !== 'unavailable' ? <Badge tone={est.quality === 'low' ? 'warn' : 'info'}>≈ {fmtKcal(est.net_kcal)} nettes · {QUALITY_LABEL[est.quality]}</Badge> : <Badge tone="warn">Dépense non estimable{est?.missing.length ? ` (manque : ${est.missing.join(', ')})` : ''}</Badge>}
                                        </p>
                                        {a.notes && <p className="mt-1 text-sm">{a.notes}</p>}
                                    </div>
                                    <div className="flex shrink-0">
                                        <Button variant="ghost" className="px-3" aria-label="Modifier cette activité" onClick={() => setEditing(a)}><Pencil className="h-4 w-4" aria-hidden /></Button>
                                        <ConfirmButton variant="ghost" className="px-3" aria-label="Supprimer cette activité" message="Supprimer définitivement cette activité ? Le bilan sera recalculé." onConfirm={async () => { await remove(a.id); toast('Activité supprimée.'); }}><Trash2 className="h-4 w-4" aria-hidden /></ConfirmButton>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </Card>

            <Modal open={editing !== null} onClose={() => setEditing(null)} title="Modifier l'activité">
                {editing && <ActivityForm catalog={catalog} entry={editing} onUpdate={update} onSaved={() => setEditing(null)} onCancel={() => setEditing(null)} />}
            </Modal>
        </div>
    );
}
