export type Level = 'beginner' | 'intermediate' | 'advanced';
export type ExCategory = 'musculation' | 'abdominaux' | 'mobilite' | 'general';

export interface Exercise {
    id: number;
    slug: string;
    name: string;
    category: ExCategory;
    muscle_group: string;
    muscles: string[];
    level: Level;
    equipment: string[];
    kind: 'reps' | 'time';
    steps: string[];
    breathing: string;
    mistakes: string[];
    precautions: string;
    easier_variant: string;
    prescriptions: Record<Level, { sets: number; reps?: number; seconds?: number; rest: number }>;
    image_start: string;
    image_end: string;
}

export interface ProgramItem {
    id?: number;
    exercise_id: number;
    position: number;
    sets: number;
    reps: number | null;
    seconds: number | null;
    rest_seconds: number;
    exercise: Pick<Exercise, 'id' | 'slug' | 'name' | 'category' | 'muscle_group' | 'level' | 'kind' | 'image_start' | 'image_end' | 'equipment'>;
}

export interface Program {
    id: number;
    user_id: number | null;
    name: string;
    goal: 'strength' | 'abs' | 'mobility' | 'fitness';
    level: Level;
    target_minutes: number | null;
    description: string | null;
    equipment: string[] | null;
    muscle_groups: string[] | null;
    days: number[] | null;
    is_template: boolean;
    estimated_minutes: number;
    items: ProgramItem[];
}

export interface WorkoutSession {
    id: number;
    name: string;
    started_at: string;
    ended_at: string;
    effective_seconds: number;
    status: 'finished' | 'stopped';
    perceived_difficulty: number | null;
    notes: string | null;
    met: number | null;
    calories_est: number | null;
    calories_method: string | null;
    activity_entry_id: number | null;
    items: { id: number; exercise_id: number | null; name: string; position: number; planned_sets: number; sets: { reps?: number; seconds?: number }[]; skipped: boolean }[];
}

export interface ExerciseAccess {
    mode: 'open' | 'restricted' | 'blocked';
    level: string;
    messages: { code: string; text: string }[];
    allowed_categories: ExCategory[];
}
