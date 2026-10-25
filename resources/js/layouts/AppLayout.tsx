import { useEffect, useState } from 'react';
import { NavLink, Outlet, Link } from 'react-router-dom';
import { Activity, Apple, BarChart3, Bed, Bell, CalendarDays, Download, Dumbbell, Flame, HeartPulse, LayoutDashboard, MapPinned, MoreHorizontal, Ruler, UserRound, Watch, WifiOff, X } from 'lucide-react';
import { useUnread } from '@/hooks/useUnread';
import { listOutbox, onOutboxChange } from '@/lib/offline';
import { cx } from '@/components/ui';

const MAIN = [
    { to: '/app', label: 'Accueil', icon: LayoutDashboard, end: true },
    { to: '/app/day', label: 'Ma journée', icon: CalendarDays },
    { to: '/app/food', label: 'Repas', icon: Apple },
    { to: '/app/activity', label: 'Activité', icon: Activity },
    { to: '/app/symptoms', label: 'Symptômes', icon: HeartPulse },
];
const MORE = [
    { to: '/app/exercises', label: 'Exercices physiques', icon: Dumbbell },
    { to: '/app/energy', label: 'Bilan énergétique', icon: Flame },
    { to: '/app/map', label: 'Carte et déplacements', icon: MapPinned },
    { to: '/app/sleep', label: 'Sommeil', icon: Bed },
    { to: '/app/notifications', label: 'Notifications', icon: Bell },
    { to: '/app/body', label: 'Mesures corporelles', icon: Ruler },
    { to: '/app/trends', label: 'Tendances', icon: BarChart3 },
    { to: '/app/watch', label: 'Ma montre', icon: Watch },
    { to: '/app/profile', label: 'Profil et paramètres', icon: UserRound },
];

interface InstallEvent extends Event {
    prompt(): Promise<void>;
}

function useOnline() {
    const [online, setOnline] = useState(navigator.onLine);
    useEffect(() => {
        const up = () => setOnline(true);
        const down = () => setOnline(false);
        window.addEventListener('online', up);
        window.addEventListener('offline', down);
        return () => {
            window.removeEventListener('online', up);
            window.removeEventListener('offline', down);
        };
    }, []);
    return online;
}

function usePendingCount() {
    const [n, setN] = useState(0);
    useEffect(() => {
        const read = () => void listOutbox().then((l) => setN(l.length)).catch(() => setN(0));
        read();
        return onOutboxChange(read);
    }, []);
    return n;
}

export default function AppLayout() {
    const online = useOnline();
    const unread = useUnread();
    const pending = usePendingCount();
    const [moreOpen, setMoreOpen] = useState(false);
    const [installEvt, setInstallEvt] = useState<InstallEvent | null>(null);

    useEffect(() => {
        const h = (e: Event) => {
            e.preventDefault();
            setInstallEvt(e as InstallEvent);
        };
        window.addEventListener('beforeinstallprompt', h);
        return () => window.removeEventListener('beforeinstallprompt', h);
    }, []);

    const link = ({ isActive }: { isActive: boolean }) =>
        cx('flex min-h-11 items-center gap-3 rounded-2xl px-3 py-2 text-sm font-medium', isActive ? 'bg-brand-600 text-white' : 'text-ink hover:bg-brand-50');

    return (
        <div className="min-h-screen lg:flex">
            <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-white focus:p-3">
                Aller au contenu
            </a>

            {/* Desktop sidebar */}
            <aside className="hidden w-64 shrink-0 flex-col gap-1 border-r border-sand-2 bg-white p-4 lg:flex" aria-label="Navigation principale">
                <Link to="/app" className="mb-4 flex items-center gap-2 px-2 text-xl font-extrabold text-brand-700">
                    <img src="/icons/icon.svg" alt="" width={32} height={32} className="h-8 w-8" /> Moyo
                </Link>
                {[...MAIN, ...MORE].map(({ to, label, icon: Icon, ...r }) => (
                    <NavLink key={to} to={to} end={'end' in r} className={link}>
                        <Icon className="h-5 w-5" aria-hidden /> {label}
                    </NavLink>
                ))}
                {installEvt && (
                    <button className="mt-auto flex min-h-11 items-center gap-2 rounded-2xl border border-brand-200 px-3 text-sm font-medium text-brand-700" onClick={() => void installEvt.prompt()}>
                        <Download className="h-4 w-4" aria-hidden /> Installer l'application
                    </button>
                )}
            </aside>

            <div className="min-w-0 flex-1">
                {(!online || pending > 0) && (
                    <div role="status" className="flex items-center justify-center gap-2 bg-amber-100 px-4 py-2 text-center text-sm font-medium text-amber-900">
                        <WifiOff className="h-4 w-4 shrink-0" aria-hidden />
                        {!online ? 'Vous êtes hors ligne. Vos nouvelles saisies sont gardées sur cet appareil.' : ''}
                        {pending > 0 && ` ${pending} saisie(s) en attente de confirmation du serveur.`}
                    </div>
                )}

                <div className="sticky top-0 z-30 flex items-center justify-between border-b border-sand-2 bg-sand/95 px-4 py-2 backdrop-blur lg:justify-end">
                    <Link to="/app" className="flex items-center gap-2 font-extrabold text-brand-700 lg:hidden"><img src="/icons/icon.svg" alt="" width={28} height={28} className="h-7 w-7" /> Moyo</Link>
                    <Link to="/app/notifications" aria-label={unread > 0 ? `Notifications : ${unread} non lue(s)` : 'Notifications'} className="relative grid h-11 w-11 place-items-center rounded-full hover:bg-white">
                        <Bell className="h-5 w-5" aria-hidden />
                        {unread > 0 && <span className="absolute right-1 top-1 grid min-h-5 min-w-5 place-items-center rounded-full bg-accent px-1 text-[11px] font-bold text-white">{unread > 9 ? '9+' : unread}</span>}
                    </Link>
                </div>

                <main id="main" className="mx-auto w-full max-w-5xl px-4 pb-28 pt-5 lg:px-8 lg:pb-10">
                    <Outlet />
                </main>
            </div>

            {/* Mobile bottom navigation: thumb-friendly, secondary items behind "Plus" */}
            <nav aria-label="Navigation mobile" className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-sand-2 bg-white lg:hidden">
                <ul className="mx-auto grid max-w-lg grid-cols-6">
                    {MAIN.map(({ to, label, icon: Icon, ...r }) => (
                        <li key={to}>
                            <NavLink to={to} end={'end' in r} className={({ isActive }) => cx('flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium', isActive ? 'text-brand-700' : 'text-muted')}>
                                <Icon className="h-5 w-5" aria-hidden />
                                {label}
                            </NavLink>
                        </li>
                    ))}
                    <li>
                        <button aria-expanded={moreOpen} onClick={() => setMoreOpen(true)} className="flex min-h-14 w-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-muted">
                            <MoreHorizontal className="h-5 w-5" aria-hidden />
                            Plus
                        </button>
                    </li>
                </ul>
            </nav>

            {moreOpen && (
                <div className="fixed inset-0 z-50 flex items-end bg-black/40 lg:hidden" onClick={() => setMoreOpen(false)}>
                    <div role="dialog" aria-modal="true" aria-label="Plus de sections" className="safe-bottom w-full rounded-t-3xl bg-white p-4" onClick={(e) => e.stopPropagation()}>
                        <div className="mb-2 flex items-center justify-between">
                            <h2 className="font-bold">Plus</h2>
                            <button aria-label="Fermer" onClick={() => setMoreOpen(false)} className="grid h-11 w-11 place-items-center rounded-full hover:bg-slate-100">
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                        <ul>
                            {MORE.map(({ to, label, icon: Icon }) => (
                                <li key={to}>
                                    <NavLink to={to} onClick={() => setMoreOpen(false)} className={link}>
                                        <Icon className="h-5 w-5" aria-hidden /> {label}
                                    </NavLink>
                                </li>
                            ))}
                            {installEvt && (
                                <li>
                                    <button className="flex min-h-11 w-full items-center gap-3 rounded-2xl px-3 py-2 text-sm font-medium" onClick={() => void installEvt.prompt()}>
                                        <Download className="h-5 w-5" aria-hidden /> Installer l'application
                                    </button>
                                </li>
                            )}
                        </ul>
                    </div>
                </div>
            )}
        </div>
    );
}
