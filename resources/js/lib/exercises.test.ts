import { describe, expect, it } from 'vitest';
import { estimateMinutes, matchesEquipment, suggest } from './exercises';
import type { Exercise } from '@/types/exercises';

const mk = (id: number, o: Partial<Exercise>): Exercise => ({
    id, slug: `e${id}`, name: `E${id}`, category: 'musculation', muscle_group: 'jambes', muscles: [], level: 'beginner', equipment: ['none'], kind: 'reps', steps: [], breathing: '', mistakes: [], precautions: '', easier_variant: '',
    prescriptions: { beginner: { sets: 2, reps: 8, rest: 60 }, intermediate: { sets: 3, reps: 10, rest: 45 }, advanced: { sets: 4, reps: 12, rest: 45 } }, image_start: '', image_end: '', ...o,
});

describe('exercise helpers', () => {
    it('estimates the duration from sets, work and rest', () => {
        expect(estimateMinutes([{ sets: 2, reps: 10, seconds: null, rest_seconds: 60 }])).toBe(3); // 2 x (30 s + 60 s) = 180 s
        expect(estimateMinutes([{ sets: 1, reps: null, seconds: 30, rest_seconds: 30 }])).toBe(1);
    });

    it('matches equipment: bodyweight always, otherwise any owned item', () => {
        expect(matchesEquipment(mk(1, {}), [])).toBe(true);
        expect(matchesEquipment(mk(1, { equipment: ['dumbbells', 'bands'] }), [])).toBe(false);
        expect(matchesEquipment(mk(1, { equipment: ['dumbbells', 'bands'] }), ['bands'])).toBe(true);
    });

    it('suggests only allowed categories, levels and equipment, within the time budget, one group first', () => {
        const cat = [mk(1, { muscle_group: 'jambes' }), mk(2, { muscle_group: 'dos' }), mk(3, { level: 'advanced' }), mk(4, { equipment: ['gym'] }), mk(5, { category: 'abdominaux', muscle_group: 'abdominaux' }), mk(6, { muscle_group: 'jambes' })];
        const s = suggest(cat, { goal: 'strength', level: 'beginner', minutes: 8, equipment: [], groups: [], allowed: ['musculation', 'general'] });
        const ids = s.map((i) => i.exercise_id);
        expect(ids).not.toContain(3);
        expect(ids).not.toContain(4);
        expect(ids).not.toContain(5);
        expect(ids.slice(0, 2).sort()).toEqual([1, 2]);
        expect(estimateMinutes(s)).toBeLessThanOrEqual(10);
        expect(suggest(cat, { goal: 'strength', level: 'beginner', minutes: 30, equipment: [], groups: [], allowed: ['mobilite'] })).toEqual([]);
    });
});
