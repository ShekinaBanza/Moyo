import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, Play, Wind } from 'lucide-react';
import { get, NetworkError } from '@/lib/api';
import { CAT_LABEL, EQUIP_LABEL, GROUP_LABEL, LEVEL_LABEL, LEVELS } from '@/lib/exercises';
import { useExerciseAccess } from '@/hooks/useExerciseAccess';
import { AccessNotice, ExImage, LevelBadge } from '@/components/ExerciseBits';
import { Alert, Badge, Button, Card, ErrorState, Spinner, cx } from '@/components/ui';
import type { Exercise, Level } from '@/types/exercises';

export default function ExerciseDetail() {
    const { slug } = useParams();
    const nav = useNavigate();
    const { access } = useExerciseAccess();
    const [e, setE] = useState<Exercise | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [level, setLevel] = useState<Level>('beginner');

    useEffect(() => {
        get<{ data: Exercise }>(`/api/v1/exercises/${slug}`).then((r) => { setE(r.data); setLevel(r.data.level); }).catch((x) => setError(x instanceof NetworkError ? 'Hors ligne : fiche indisponible.' : 'Exercice introuvable.'));
    }, [slug]);

    if (error) return <ErrorState text={error} />;
    if (!e) return <Spinner />;
    const rx = e.prescriptions[level];
    const locked = access ? !access.allowed_categories.includes(e.category) : false;
    const item = { exerciseId: e.id, name: e.name, kind: e.kind, sets: rx.sets, reps: rx.reps ?? null, seconds: rx.seconds ?? null, rest: rx.rest, category: e.category };

    return (
        <div className="space-y-5">
            <Link to={`/app/exercises/list?category=${e.category}`} className="text-sm font-semibold text-brand-700 underline">← {CAT_LABEL[e.category]}</Link>
            <header>
                <h1 className="text-2xl font-bold tracking-tight text-brand-900">{e.name}</h1>
                <p className="mt-2 flex flex-wrap items-center gap-2"><LevelBadge level={e.level} /><Badge>{GROUP_LABEL[e.muscle_group] ?? e.muscle_group}</Badge>{e.equipment.map((x) => <Badge key={x} tone="info">{EQUIP_LABEL[x]}</Badge>)}</p>
                <p className="mt-2 text-sm text-muted"><strong>Muscles sollicités :</strong> {e.muscles.join(', ')}</p>
            </header>
            <AccessNotice access={access} />

            <div className="grid grid-cols-2 gap-3">
                <figure><ExImage src={e.image_start} alt={`${e.name} : position de départ`} /><figcaption className="mt-1 text-center text-xs font-semibold text-muted">Position de départ</figcaption></figure>
                <figure><ExImage src={e.image_end} alt={`${e.name} : position finale`} /><figcaption className="mt-1 text-center text-xs font-semibold text-muted">Position finale</figcaption></figure>
            </div>

            <Card aria-labelledby="rx">
                <h2 id="rx" className="mb-3 font-bold">Séries, répétitions et repos conseillés</h2>
                <div role="group" aria-label="Niveau de pratique" className="mb-3 flex flex-wrap gap-2">
                    {LEVELS.map((l) => <button key={l} type="button" aria-pressed={level === l} onClick={() => setLevel(l)} className={cx('min-h-11 rounded-full border px-4 text-sm font-semibold', level === l ? 'border-brand-600 bg-brand-600 text-white' : 'border-sand-2 bg-white hover:bg-brand-50')}>{LEVEL_LABEL[l]}</button>)}
                </div>
                <p className="text-lg font-bold text-brand-900">{rx.sets} séries × {e.kind === 'time' ? `${rx.seconds} s` : `${rx.reps} répétitions`} <span className="text-sm font-normal text-muted">· repos {rx.rest} s</span></p>
                <p className="mt-1 text-xs text-muted">Points de départ habituels, pas une prescription. Moyo ne les augmente jamais automatiquement : réduisez si c'est trop, arrêtez en cas de gêne.</p>
                <div className="mt-4">
                    {locked ? <p className="text-sm font-semibold text-amber-900">Cet exercice n'est pas proposé pour l'instant (voir le message de prudence ci-dessus).</p>
                        : <Button className="min-h-12" onClick={() => nav('/app/exercises/run', { state: { name: e.name, items: [item] } })}><Play className="h-4 w-4" aria-hidden /> Faire cet exercice</Button>}
                </div>
            </Card>

            <Card aria-labelledby="how">
                <h2 id="how" className="mb-2 font-bold">Comment le faire</h2>
                <ol className="list-decimal space-y-2 pl-5">{e.steps.map((s) => <li key={s}>{s}</li>)}</ol>
                <p className="mt-4 flex items-start gap-2 rounded-2xl bg-brand-50 p-3 text-sm"><Wind className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-hidden /> <span><strong>Respiration :</strong> {e.breathing}</span></p>
            </Card>

            <Card aria-labelledby="err">
                <h2 id="err" className="mb-2 font-bold">Erreurs fréquentes</h2>
                <ul className="list-disc space-y-1 pl-5">{e.mistakes.map((m) => <li key={m}>{m}</li>)}</ul>
            </Card>

            <Card aria-labelledby="prec">
                <h2 id="prec" className="mb-2 flex items-center gap-2 font-bold"><AlertTriangle className="h-4 w-4 text-amber-700" aria-hidden /> Précautions et variante plus facile</h2>
                <p>{e.precautions}</p>
                <p className="mt-2"><strong>Plus facile :</strong> {e.easier_variant}</p>
            </Card>

            <Alert tone="warn" title="Arrêtez et demandez un avis médical">
                <p>Douleur inhabituelle, vertige, malaise ou essoufflement anormal : arrêtez l'exercice. En cas d'essoufflement important au repos, de douleur thoracique ou d'évanouissement, appelez les secours médicaux d'urgence de votre région.</p>
            </Alert>
        </div>
    );
}
