import { useCallback, useEffect, useState } from 'react';

export type ThemeChoice = 'system' | 'light' | 'dark';
const KEY = 'moyo-theme';

function read(): ThemeChoice {
    try {
        const v = localStorage.getItem(KEY);
        return v === 'light' || v === 'dark' ? v : 'system';
    } catch {
        return 'system';
    }
}

function apply(choice: ThemeChoice) {
    const dark = choice === 'dark' || (choice === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', dark);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0a1211' : '#0f766e');
}

/** Light / dark / follow the device. The choice stays on this device only. */
export function useTheme() {
    const [choice, setChoice] = useState<ThemeChoice>(read);

    useEffect(() => {
        apply(choice);
        if (choice !== 'system') return;
        const mq = window.matchMedia('(prefers-color-scheme: dark)');
        const h = () => apply('system');
        mq.addEventListener('change', h);
        return () => mq.removeEventListener('change', h);
    }, [choice]);

    const set = useCallback((c: ThemeChoice) => {
        try {
            if (c === 'system') localStorage.removeItem(KEY);
            else localStorage.setItem(KEY, c);
        } catch {
            /* storage blocked: the choice applies for this visit only */
        }
        setChoice(c);
    }, []);

    const cycle = useCallback(() => set(choice === 'system' ? 'light' : choice === 'light' ? 'dark' : 'system'), [choice, set]);
    return { choice, set, cycle };
}
