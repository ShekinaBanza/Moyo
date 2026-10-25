import { Link } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { Alert, Badge, cx } from '@/components/ui';
import { EQUIP_LABEL, GROUP_LABEL, LEVEL_LABEL } from '@/lib/exercises';
import type { Exercise, ExerciseAccess } from '@/types/exercises';

/** Local fallback illustration if a file is ever missing: the card never shows a broken image. */
export function ExImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
    return <img src={src} alt={alt} width={240} height={160} loading="lazy" decoding="async" className={cx('aspect-[3/2] w-full rounded-2xl bg-sand-2 object-cover', className)} onError={(e) => { const t = e.currentTarget; if (!t.dataset.fb) { t.dataset.fb = '1'; t.src = '/images/exercises/banner.svg'; } }} />;
}

export function LevelBadge({ level }: { level: Exercise['level'] }) {
    return <Badge tone={level === 'beginner' ? 'ok' : level === 'intermediate' ? 'warn' : 'danger'}>{LEVEL_LABEL[level]}</Badge>;
}

export function ExerciseCard({ e, locked }: { e: Pick<Exercise, 'slug' | 'name' | 'image_start' | 'muscles' | 'level' | 'equipment' | 'kind' | 'muscle_group' | 'prescriptions'>; locked?: boolean }) {
    const rx = e.prescriptions.beginner;
    const dur = Math.max(1, Math.round((rx.sets * ((rx.seconds ?? (rx.reps ?? 10) * 3) + rx.rest)) / 60));
    return (
        <li>
            <Link to={`/app/exercises/${e.slug}`} className="flex h-full flex-col overflow-hidden rounded-3xl bg-white shadow-soft transition hover:shadow-lg">
                <div className="relative">
                    <ExImage src={e.image_start} alt={`${e.name} : position de départ`} className="rounded-b-none" />
                    {locked && <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-white/95 px-2 py-1 text-xs font-semibold text-amber-900"><Lock className="h-3 w-3" aria-hidden /> Non proposé pour l'instant</span>}
                </div>
                <div className="flex flex-1 flex-col gap-1 p-4">
                    <h3 className="font-bold leading-tight">{e.name}</h3>
                    <p className="text-sm text-muted">{e.muscles.slice(0, 3).join(' · ')}</p>
                    <div className="mt-auto flex flex-wrap items-center gap-2 pt-2 text-xs">
                        <LevelBadge level={e.level} />
                        <Badge>{GROUP_LABEL[e.muscle_group] ?? e.muscle_group}</Badge>
                        <span className="text-muted">≈ {dur} min · {e.equipment.map((x) => EQUIP_LABEL[x]).join(' / ')}</span>
                    </div>
                </div>
            </Link>
        </li>
    );
}

export function AccessNotice({ access }: { access: ExerciseAccess | null }) {
    if (!access || access.mode === 'open') return null;
    return (
        <Alert tone={access.mode === 'blocked' ? 'danger' : 'warn'} title={access.mode === 'blocked' ? 'Aide médicale urgente recommandée' : 'Exercices limités par prudence'}>
            {access.messages.map((m) => <p key={m.code}>{m.text}</p>)}
            <p><Link to="/app/symptoms" className="font-semibold underline">Voir mes symptômes</Link> · <Link to="/app/profile" className="font-semibold underline">Indiquer une évaluation médicale</Link></p>
        </Alert>
    );
}
