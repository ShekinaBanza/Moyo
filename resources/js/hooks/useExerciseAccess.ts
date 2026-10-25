import { useEffect, useState } from 'react';
import { get } from '@/lib/api';
import type { ExerciseAccess } from '@/types/exercises';

/** Access mode decided by the server from the user's declared symptoms (never from the wearable). */
export function useExerciseAccess() {
    const [access, setAccess] = useState<ExerciseAccess | null>(null);
    const [error, setError] = useState(false);
    useEffect(() => {
        get<{ data: ExerciseAccess }>('/api/v1/exercises/access').then((r) => setAccess(r.data)).catch(() => setError(true));
    }, []);
    return { access, error };
}
