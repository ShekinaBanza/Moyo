import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ClipboardList, LineChart, Play } from 'lucide-react';
import { get } from '@/lib/api';
import { CAT_IMAGE, CAT_LABEL, CAT_TEXT } from '@/lib/exercises';
import { useExerciseAccess } from '@/hooks/useExerciseAccess';
import { AccessNotice, ExImage } from '@/components/ExerciseBits';
import { Alert, Badge, Card, Spinner } from '@/components/ui';
import type { ExCategory, Program } from '@/types/exercises';

const CATS: ExCategory[] = ['musculation', 'abdominaux', 'mobilite', 'general'];

export default function ExercisesHome() {
    const { access } = useExerciseAccess();
    const [programs, setPrograms] = useState<Program[] | null>(null);
    useEffect(() => {
        get<{ data: Program[] }>('/api/v1/workout-programs').then((r) => setPrograms(r.data)).catch(() => setPrograms([]));
    }, []);

    return (
        <div className="space-y-6">
            <section className="overflow-hidden rounded-3xl bg-brand-50">
                <img src="/images/exercises/banner.svg" alt="Trois personnes à l'entraînement : squat, curl avec haltère et gainage" width={400} height={160} className="h-40 w-full object-cover sm:h-52" />
                <div className="p-5">
                    <h1 className="text-2xl font-bold tracking-tight text-brand-900">Exercices physiques</h1>
                    <p className="mt-1 text-sm text-muted">Musculation, abdominaux, mobilité et séances guidées, avec ou sans matériel. À votre rythme : Moyo ne vous impose ni charge ni progression.</p>
                    <div className="mt-3 flex flex-wrap gap-2 text-sm font-semibold">
                        <Link to="/app/exercises/programs" className="inline-flex min-h-11 items-center gap-2 rounded-full bg-brand-600 px-5 text-white"><ClipboardList className="h-4 w-4" aria-hidden /> Mes programmes</Link>
                        <Link to="/app/exercises/progress" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-brand-200 bg-white px-5 text-brand-700"><LineChart className="h-4 w-4" aria-hidden /> Ma progression</Link>
                    </div>
                </div>
            </section>

            <AccessNotice access={access} />

            <section aria-labelledby="cats">
                <h2 id="cats" className="mb-3 text-lg font-bold">Catégories</h2>
                <ul className="grid gap-4 sm:grid-cols-2">
                    {CATS.map((c) => {
                        const locked = access ? !access.allowed_categories.includes(c) : false;
                        return (
                            <li key={c}>
                                <Link to={`/app/exercises/list?category=${c}`} className="flex h-full flex-col overflow-hidden rounded-3xl bg-white shadow-soft transition hover:shadow-lg">
                                    <ExImage src={CAT_IMAGE[c]} alt={`Illustration : ${CAT_LABEL[c]}`} className="rounded-b-none" />
                                    <div className="flex flex-1 flex-col p-4">
                                        <h3 className="flex items-center justify-between gap-2 text-lg font-bold">{CAT_LABEL[c]} <ArrowRight className="h-4 w-4 text-brand-600" aria-hidden /></h3>
                                        <p className="mt-1 text-sm text-muted">{CAT_TEXT[c]}</p>
                                        {locked && <p className="mt-2"><Badge tone="warn">Non proposé pour l'instant (prudence)</Badge></p>}
                                    </div>
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            </section>

            <section aria-labelledby="progs">
                <h2 id="progs" className="mb-3 text-lg font-bold">Séances prêtes à démarrer</h2>
                {!programs ? <Spinner /> : (
                    <ul className="grid gap-3 sm:grid-cols-2">
                        {programs.map((p) => {
                            const cats = new Set(p.items.map((i) => i.exercise.category));
                            const locked = access ? [...cats].some((c) => !access.allowed_categories.includes(c)) : false;
                            return (
                                <li key={p.id}>
                                    <Card as="article" className="flex h-full flex-col">
                                        <p className="flex flex-wrap items-center gap-2"><Badge tone={p.is_template ? 'info' : 'neutral'}>{p.is_template ? 'Modèle modifiable' : 'Mon programme'}</Badge>{locked && <Badge tone="warn">Non proposé pour l'instant</Badge>}</p>
                                        <h3 className="mt-2 font-bold">{p.name}</h3>
                                        <p className="text-sm text-muted">{p.items.length} exercices · ≈ {p.estimated_minutes} min</p>
                                        <div className="mt-auto pt-3">
                                            {locked ? <span className="text-sm text-muted">Disponible quand l'accès est rétabli.</span> : <Link to={`/app/exercises/run?program=${p.id}`} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-brand-600 px-5 text-sm font-semibold text-white"><Play className="h-4 w-4" aria-hidden /> Démarrer ma séance</Link>}
                                        </div>
                                    </Card>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </section>

            <Alert tone="info" title="À savoir">
                <p>Un exercice abdominal ne fait pas disparaître spécifiquement la graisse du ventre : la perte de graisse ne se cible pas sur une zone du corps.</p>
                <p>Arrêtez l'exercice en cas de douleur inhabituelle, de vertige ou d'essoufflement anormal. Moyo ne remplace pas un professionnel de santé.</p>
            </Alert>
        </div>
    );
}
