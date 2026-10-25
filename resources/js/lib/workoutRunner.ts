/*
 * Pure state machine of a workout session. Time is injected (`now`, in ms), so it is deterministic and tested.
 * Timers are REAL: countdowns are derived from timestamps, never from a simulated progress value.
 */
export interface RunItem {
    exerciseId: number;
    name: string;
    kind: 'reps' | 'time';
    sets: number;
    reps: number | null;
    seconds: number | null;
    rest: number;
}

export interface Step {
    type: 'work' | 'rest';
    ex: number; // index in items
    set: number; // 0-based
}

export interface SetResult {
    reps?: number;
    seconds?: number;
}

export interface RunState {
    items: RunItem[];
    steps: Step[];
    idx: number;
    status: 'idle' | 'running' | 'paused' | 'done';
    stoppedEarly: boolean;
    startedAt: number | null;
    endedAt: number | null;
    stepStartedAt: number;
    pausedAt: number | null;
    activeMs: number;
    activeSince: number | null;
    results: SetResult[][];
    skipped: boolean[];
}

export function buildSteps(items: RunItem[]): Step[] {
    const steps: Step[] = [];
    items.forEach((it, ex) => {
        for (let s = 0; s < it.sets; s++) {
            steps.push({ type: 'work', ex, set: s });
            const last = ex === items.length - 1 && s === it.sets - 1;
            if (!last && it.rest > 0) steps.push({ type: 'rest', ex, set: s });
        }
    });
    return steps;
}

export const initRun = (items: RunItem[]): RunState => ({
    items, steps: buildSteps(items), idx: 0, status: 'idle', stoppedEarly: false, startedAt: null, endedAt: null,
    stepStartedAt: 0, pausedAt: null, activeMs: 0, activeSince: null, results: items.map(() => []), skipped: items.map(() => false),
});

export type Action =
    | { t: 'init'; items: RunItem[] }
    | { t: 'start'; now: number }
    | { t: 'tick'; now: number }
    | { t: 'pause'; now: number }
    | { t: 'resume'; now: number }
    | { t: 'completeSet'; now: number; reps?: number }
    | { t: 'skipRest'; now: number }
    | { t: 'nextExercise'; now: number }
    | { t: 'prevExercise'; now: number }
    | { t: 'finish'; now: number; early?: boolean };

export const currentStep = (s: RunState): Step | null => (s.status === 'done' ? null : s.steps[s.idx] ?? null);

/** Milliseconds spent in the current step (frozen while paused). */
export function stepElapsedMs(s: RunState, now: number): number {
    const ref = s.status === 'paused' && s.pausedAt !== null ? s.pausedAt : now;
    return Math.max(0, ref - s.stepStartedAt);
}

/** Target duration (s) of the current step when it is a countdown, else null. */
export function stepTargetSeconds(s: RunState): number | null {
    const st = currentStep(s);
    if (!st) return null;
    const it = s.items[st.ex];
    if (st.type === 'rest') return it.rest;
    return it.kind === 'time' ? it.seconds : null;
}

export function remainingSeconds(s: RunState, now: number): number | null {
    const target = stepTargetSeconds(s);
    return target === null ? null : Math.max(0, Math.ceil(target - stepElapsedMs(s, now) / 1000));
}

export function totalActiveSeconds(s: RunState, now: number): number {
    const live = s.activeSince !== null ? now - s.activeSince : 0;
    return Math.round((s.activeMs + live) / 1000);
}

const goTo = (s: RunState, idx: number, now: number): RunState => {
    if (idx >= s.steps.length) return finish(s, now, false);
    return { ...s, idx, stepStartedAt: now, pausedAt: s.status === 'paused' ? now : null };
};

function finish(s: RunState, now: number, early: boolean): RunState {
    if (s.status === 'done') return s;
    const live = s.activeSince !== null ? now - s.activeSince : 0;
    return { ...s, status: 'done', stoppedEarly: early, endedAt: now, activeMs: s.activeMs + live, activeSince: null, pausedAt: null };
}

const firstStepOf = (s: RunState, ex: number) => s.steps.findIndex((st) => st.ex === ex);

export function reduce(s: RunState, a: Action): RunState {
    switch (a.t) {
        case 'init':
            return s.status === 'idle' ? initRun(a.items) : s;
        case 'start':
            if (s.status !== 'idle') return s;
            return { ...s, status: 'running', startedAt: a.now, stepStartedAt: a.now, activeSince: a.now };
        case 'pause':
            if (s.status !== 'running') return s;
            return { ...s, status: 'paused', pausedAt: a.now, activeMs: s.activeMs + (s.activeSince !== null ? a.now - s.activeSince : 0), activeSince: null };
        case 'resume': {
            if (s.status !== 'paused' || s.pausedAt === null) return s;
            const gap = a.now - s.pausedAt;
            return { ...s, status: 'running', stepStartedAt: s.stepStartedAt + gap, pausedAt: null, activeSince: a.now };
        }
        case 'tick': {
            if (s.status !== 'running') return s;
            const st = currentStep(s);
            const target = stepTargetSeconds(s);
            if (!st || target === null || stepElapsedMs(s, a.now) < target * 1000) return s;
            if (st.type === 'rest') return goTo(s, s.idx + 1, s.stepStartedAt + target * 1000);
            // a timed set ends by itself: it is recorded with the planned seconds actually elapsed
            return reduce(s, { t: 'completeSet', now: s.stepStartedAt + target * 1000, reps: undefined });
        }
        case 'completeSet': {
            const st = currentStep(s);
            if (s.status === 'idle' || s.status === 'done' || !st || st.type !== 'work') return s;
            const it = s.items[st.ex];
            const result: SetResult = it.kind === 'time' ? { seconds: Math.min(it.seconds ?? 0, Math.round(stepElapsedMs(s, a.now) / 1000)) } : { reps: Math.max(0, Math.round(a.reps ?? it.reps ?? 0)) };
            const results = s.results.map((r, i) => (i === st.ex ? [...r, result] : r));
            return goTo({ ...s, results }, s.idx + 1, a.now);
        }
        case 'skipRest': {
            const st = currentStep(s);
            return st?.type === 'rest' ? goTo(s, s.idx + 1, a.now) : s;
        }
        case 'nextExercise': {
            const st = currentStep(s);
            if (!st || s.status === 'idle' || s.status === 'done') return s;
            const skipped = s.skipped.map((v, i) => (i === st.ex ? s.results[st.ex].length === 0 : v));
            const nxt = s.steps.findIndex((x, i) => i > s.idx && x.ex > st.ex);
            return nxt === -1 ? finish({ ...s, skipped }, a.now, false) : goTo({ ...s, skipped }, nxt, a.now);
        }
        case 'prevExercise': {
            const st = currentStep(s);
            if (!st || s.status === 'idle' || s.status === 'done') return s;
            // within an exercise already started, "previous" restarts it; otherwise it goes to the previous exercise
            const target = st.set > 0 || st.type === 'rest' ? st.ex : Math.max(0, st.ex - 1);
            const results = s.results.map((r, i) => (i === target ? [] : r));
            const skipped = s.skipped.map((v, i) => (i === target ? false : v));
            return goTo({ ...s, results, skipped }, firstStepOf(s, target), a.now);
        }
        case 'finish':
            return finish(s, a.now, !!a.early);
    }
}

export const doneSets = (s: RunState) => s.results.reduce((n, r) => n + r.length, 0);
export const plannedSets = (s: RunState) => s.items.reduce((n, i) => n + i.sets, 0);
