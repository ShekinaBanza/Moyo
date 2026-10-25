import type { Exercise, ExCategory, Level, Program, ProgramItem } from '@/types/exercises';

export const LEVEL_LABEL: Record<Level, string> = { beginner: 'Débutant', intermediate: 'Intermédiaire', advanced: 'Avancé' };
export const CAT_LABEL: Record<ExCategory, string> = { musculation: 'Musculation', abdominaux: 'Abdominaux', mobilite: 'Mobilité et étirements', general: 'Renforcement général' };
export const CAT_IMAGE: Record<ExCategory, string> = { musculation: '/images/exercises/cat-musculation.svg', abdominaux: '/images/exercises/cat-abdominaux.svg', mobilite: '/images/exercises/cat-mobilite.svg', general: '/images/exercises/cat-general.svg' };
export const CAT_TEXT: Record<ExCategory, string> = {
    musculation: 'Pectoraux, dos, épaules, bras, jambes et fessiers. Avec ou sans matériel.',
    abdominaux: 'Gainage, stabilité du tronc et abdominaux, du plus simple au plus exigeant.',
    mobilite: 'Étirements doux et mobilité pour assouplir le corps.',
    general: 'Exercices du corps entier et circuits simples.',
};
export const GROUP_LABEL: Record<string, string> = { pectoraux: 'Pectoraux', dos: 'Dos', epaules: 'Épaules', biceps_triceps: 'Biceps et triceps', jambes: 'Jambes', fessiers: 'Fessiers', corps_entier: 'Corps entier', abdominaux: 'Abdominaux', mobilite: 'Mobilité' };
export const EQUIP_LABEL: Record<string, string> = { none: 'Sans matériel', dumbbells: 'Haltères', bands: 'Élastiques', chair: 'Chaise / support', wall: 'Mur', gym: 'Salle (machines)' };
export const GOAL_LABEL: Record<Program['goal'], string> = { strength: 'Renforcement musculaire', abs: 'Abdominaux', mobility: 'Mobilité', fitness: 'Remise en forme' };
export const DAY_LABEL = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
export const LEVELS: Level[] = ['beginner', 'intermediate', 'advanced'];
const ORDER: Record<Level, number> = { beginner: 0, intermediate: 1, advanced: 2 };

/** Can the user do it with what they have? "none" always works; otherwise any listed equipment is enough. */
export const matchesEquipment = (e: Pick<Exercise, 'equipment'>, have: string[]): boolean => e.equipment.includes('none') || e.equipment.some((x) => have.includes(x));

export const rxFor = (e: Pick<Exercise, 'prescriptions'>, level: Level) => e.prescriptions[level];

/** Estimated duration: work (3 s per rep, or the planned seconds) + rest for every set, in minutes (>= 1). Same rule as the server. */
export function estimateMinutes(items: { sets: number; reps: number | null; seconds: number | null; rest_seconds: number }[]): number {
    const s = items.reduce((n, i) => n + i.sets * ((i.seconds ?? (i.reps ?? 10) * 3) + i.rest_seconds), 0);
    return Math.max(1, Math.round(s / 60));
}

/**
 * Suggests exercises for the chosen goal, level, time, equipment and muscle groups. It only SUGGESTS (the user edits),
 * never goes above the chosen level and never raises sets, reps or load by itself.
 */
export function suggest(catalog: Exercise[], o: { goal: Program['goal']; level: Level; minutes: number; equipment: string[]; groups: string[]; allowed: ExCategory[] }): ProgramItem[] {
    const wanted: Record<Program['goal'], ExCategory[]> = { strength: ['musculation', 'general'], abs: ['abdominaux'], mobility: ['mobilite'], fitness: ['musculation', 'abdominaux', 'mobilite', 'general'] };
    let pool = catalog.filter((e) => wanted[o.goal].includes(e.category) && o.allowed.includes(e.category) && ORDER[e.level] <= ORDER[o.level] && matchesEquipment(e, o.equipment));
    if (o.groups.length && o.goal !== 'abs' && o.goal !== 'mobility') {
        const g = pool.filter((e) => o.groups.includes(e.muscle_group) || (o.groups.includes('corps_entier') && e.category === 'general'));
        if (g.length >= 2) pool = g;
    }
    // one exercise per muscle group first, then the rest
    const seen = new Set<string>();
    const first = pool.filter((e) => {
        if (seen.has(e.muscle_group)) return false;
        seen.add(e.muscle_group);
        return true;
    });
    const ordered = [...first, ...pool.filter((e) => !first.includes(e))];
    const out: ProgramItem[] = [];
    for (const e of ordered) {
        const rx = rxFor(e, o.level);
        const item: ProgramItem = { exercise_id: e.id, position: out.length, sets: rx.sets, reps: rx.reps ?? null, seconds: rx.seconds ?? null, rest_seconds: rx.rest, exercise: e };
        if (out.length >= 1 && estimateMinutes([...out, item]) > o.minutes) break;
        out.push(item);
        if (out.length >= 12) break;
    }
    return out;
}
