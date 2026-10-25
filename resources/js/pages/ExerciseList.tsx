import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { get, NetworkError } from '@/lib/api';
import { CAT_IMAGE, CAT_LABEL, CAT_TEXT, EQUIP_LABEL, GROUP_LABEL, LEVEL_LABEL, LEVELS, matchesEquipment } from '@/lib/exercises';
import { useExerciseAccess } from '@/hooks/useExerciseAccess';
import { AccessNotice, ExerciseCard } from '@/components/ExerciseBits';
import { Alert, Button, ErrorState, Input, PageHeader, Spinner, cx } from '@/components/ui';
import type { Exercise, ExCategory, Level } from '@/types/exercises';

const CATS: ExCategory[] = ['musculation', 'abdominaux', 'mobilite', 'general'];
const EQUIP = ['none', 'dumbbells', 'bands', 'chair', 'wall', 'gym'];

export default function ExerciseList() {
    const [params, setParams] = useSearchParams();
    const category = (params.get('category') as ExCategory | null) ?? 'musculation';
    const { access } = useExerciseAccess();
    const [all, setAll] = useState<Exercise[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [group, setGroup] = useState('all');
    const [level, setLevel] = useState<'all' | Level>('all');
    const [have, setHave] = useState<string[] | null>(null); // null = show everything
    const [q, setQ] = useState('');

    useEffect(() => {
        setAll(null);
        get<{ data: Exercise[] }>(`/api/v1/exercises?category=${category}`).then((r) => { setAll(r.data); setError(null); }).catch((e) => setError(e instanceof NetworkError ? 'Hors ligne : le catalogue ne peut pas être chargé.' : 'Chargement impossible.'));
        setGroup('all');
    }, [category]);

    const groups = useMemo(() => [...new Set((all ?? []).map((e) => e.muscle_group))], [all]);
    const shown = (all ?? []).filter((e) => (group === 'all' || e.muscle_group === group) && (level === 'all' || e.level === level) && (!have || matchesEquipment(e, have)) && e.name.toLowerCase().includes(q.trim().toLowerCase()));
    const locked = access ? !access.allowed_categories.includes(category) : false;
    const toggle = (k: string) => setHave((h) => { const cur = h ?? ['none']; return cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]; });

    return (
        <div className="space-y-5">
            <PageHeader title={CAT_LABEL[category]} subtitle={CAT_TEXT[category]} image={CAT_IMAGE[category]} action={<Link to="/app/exercises" className="text-sm font-semibold text-brand-700 underline">← Exercices physiques</Link>} />
            <AccessNotice access={access} />
            <div role="tablist" aria-label="Catégories" className="flex flex-wrap gap-2">
                {CATS.map((c) => <button key={c} role="tab" aria-selected={c === category} onClick={() => setParams({ category: c })} className={cx('min-h-11 rounded-full border px-4 text-sm font-semibold', c === category ? 'border-brand-600 bg-brand-600 text-white' : 'border-sand-2 bg-white hover:bg-brand-50')}>{CAT_LABEL[c]}</button>)}
            </div>

            <div className="space-y-3 rounded-3xl bg-white p-4 shadow-soft">
                <Input label="Rechercher un exercice" type="search" value={q} onChange={(e) => setQ(e.target.value)} />
                {groups.length > 1 && (
                    <div role="group" aria-label="Groupes musculaires" className="flex flex-wrap gap-2">
                        {['all', ...groups].map((g) => <button key={g} type="button" aria-pressed={group === g} onClick={() => setGroup(g)} className={cx('min-h-9 rounded-full border px-3 text-xs font-semibold', group === g ? 'border-brand-600 bg-brand-600 text-white' : 'border-sand-2 hover:bg-brand-50')}>{g === 'all' ? 'Tous les muscles' : GROUP_LABEL[g] ?? g}</button>)}
                    </div>
                )}
                <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Niveau">
                    <span className="text-sm font-medium">Niveau :</span>
                    {(['all', ...LEVELS] as const).map((l) => <button key={l} type="button" aria-pressed={level === l} onClick={() => setLevel(l)} className={cx('min-h-9 rounded-full border px-3 text-xs font-semibold', level === l ? 'border-brand-600 bg-brand-600 text-white' : 'border-sand-2 hover:bg-brand-50')}>{l === 'all' ? 'Tous' : LEVEL_LABEL[l]}</button>)}
                </div>
                <fieldset>
                    <legend className="mb-1 text-sm font-medium">Matériel disponible {have ? '' : <span className="font-normal text-muted">(tout est affiché)</span>}</legend>
                    <div className="flex flex-wrap gap-3">
                        {EQUIP.map((k) => <label key={k} className="flex min-h-9 items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5" checked={(have ?? []).includes(k)} onChange={() => toggle(k)} /> {EQUIP_LABEL[k]}</label>)}
                        {have && <Button variant="ghost" className="min-h-9 px-3" onClick={() => setHave(null)}>Tout afficher</Button>}
                    </div>
                </fieldset>
            </div>

            {category === 'abdominaux' && <Alert tone="info">Les abdominaux renforcent le tronc, mais ne font pas fondre spécifiquement la graisse du ventre : elle ne se cible pas sur une zone.</Alert>}
            {error && <ErrorState text={error} />}
            {!all && !error && <Spinner />}
            {all && shown.length === 0 && <p className="py-8 text-center text-sm text-muted">Aucun exercice ne correspond à ces filtres. Essayez « Tout afficher ».</p>}
            {all && shown.length > 0 && <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{shown.map((e) => <ExerciseCard key={e.id} e={e} locked={locked} />)}</ul>}
        </div>
    );
}
