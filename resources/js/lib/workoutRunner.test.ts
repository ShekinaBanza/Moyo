import { describe, expect, it } from 'vitest';
import { buildSteps, currentStep, doneSets, initRun, reduce, remainingSeconds, totalActiveSeconds, type RunItem, type RunState } from './workoutRunner';

const items: RunItem[] = [
    { exerciseId: 1, name: 'Squat', kind: 'reps', sets: 2, reps: 10, seconds: null, rest: 30 },
    { exerciseId: 2, name: 'Gainage', kind: 'time', sets: 1, reps: null, seconds: 20, rest: 30 },
];
const T0 = 1_000_000;
const started = (): RunState => reduce(initRun(items), { t: 'start', now: T0 });

describe('workout runner', () => {
    it('builds work and rest steps, with no rest after the very last set', () => {
        const steps = buildSteps(items).map((s) => `${s.type[0]}${s.ex}.${s.set}`);
        expect(steps).toEqual(['w0.0', 'r0.0', 'w0.1', 'r0.1', 'w1.0']);
    });

    it('records the reps really done, then enters a rest countdown that ends by itself', () => {
        let s = started();
        s = reduce(s, { t: 'completeSet', now: T0 + 20_000, reps: 8 });
        expect(s.results[0]).toEqual([{ reps: 8 }]);
        expect(currentStep(s)?.type).toBe('rest');
        expect(remainingSeconds(s, T0 + 20_000)).toBe(30);
        expect(remainingSeconds(s, T0 + 35_000)).toBe(15);
        s = reduce(s, { t: 'tick', now: T0 + 49_000 });
        expect(currentStep(s)?.type).toBe('rest'); // 29 s elapsed: not finished
        s = reduce(s, { t: 'tick', now: T0 + 50_000 });
        expect(currentStep(s)).toMatchObject({ type: 'work', ex: 0, set: 1 });
    });

    it('a timed set counts down for real and completes by itself with the planned seconds', () => {
        let s = started();
        s = reduce(s, { t: 'nextExercise', now: T0 + 1000 });
        expect(currentStep(s)).toMatchObject({ type: 'work', ex: 1 });
        const t1 = T0 + 1000;
        expect(remainingSeconds(s, t1 + 5000)).toBe(15);
        s = reduce(s, { t: 'tick', now: t1 + 19_999 });
        expect(s.status).toBe('running');
        s = reduce(s, { t: 'tick', now: t1 + 20_000 });
        expect(s.status).toBe('done');
        expect(s.results[1]).toEqual([{ seconds: 20 }]);
    });

    it('pause freezes both the countdown and the effective duration, resume continues', () => {
        let s = started();
        s = reduce(s, { t: 'completeSet', now: T0 + 10_000, reps: 10 }); // rest starts at T0+10s
        s = reduce(s, { t: 'pause', now: T0 + 20_000 }); // 10 s of rest elapsed
        expect(remainingSeconds(s, T0 + 20_000)).toBe(20);
        expect(remainingSeconds(s, T0 + 500_000)).toBe(20); // frozen
        expect(totalActiveSeconds(s, T0 + 500_000)).toBe(20);
        s = reduce(s, { t: 'tick', now: T0 + 500_000 });
        expect(currentStep(s)?.type).toBe('rest'); // ticks do nothing while paused
        s = reduce(s, { t: 'resume', now: T0 + 500_000 });
        expect(remainingSeconds(s, T0 + 500_000)).toBe(20);
        expect(remainingSeconds(s, T0 + 510_000)).toBe(10);
        expect(totalActiveSeconds(s, T0 + 510_000)).toBe(30);
    });

    it('skipping an exercise without doing a set marks it skipped; no invented sets', () => {
        let s = started();
        s = reduce(s, { t: 'nextExercise', now: T0 + 2000 });
        expect(s.skipped).toEqual([true, false]);
        expect(doneSets(s)).toBe(0);
    });

    it('previous restarts the current exercise and clears its sets', () => {
        let s = started();
        s = reduce(s, { t: 'completeSet', now: T0 + 5000, reps: 10 });
        s = reduce(s, { t: 'skipRest', now: T0 + 6000 });
        s = reduce(s, { t: 'prevExercise', now: T0 + 7000 });
        expect(s.results[0]).toEqual([]);
        expect(currentStep(s)).toMatchObject({ type: 'work', ex: 0, set: 0 });
    });

    it('finishing early keeps only what was done and freezes the clock', () => {
        let s = started();
        s = reduce(s, { t: 'completeSet', now: T0 + 5000, reps: 7 });
        s = reduce(s, { t: 'finish', now: T0 + 9000, early: true });
        expect(s.status).toBe('done');
        expect(s.stoppedEarly).toBe(true);
        expect(doneSets(s)).toBe(1);
        expect(totalActiveSeconds(s, T0 + 999_000)).toBe(9);
        expect(reduce(s, { t: 'completeSet', now: T0 + 10_000, reps: 5 })).toBe(s); // nothing after the end
    });
});
