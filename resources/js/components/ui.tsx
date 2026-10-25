import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useId,
    useRef,
    useState,
    type ButtonHTMLAttributes,
    type InputHTMLAttributes,
    type ReactNode,
    type SelectHTMLAttributes,
    type TextareaHTMLAttributes,
} from 'react';
import { AlertTriangle, CheckCircle2, Info, Loader2, X } from 'lucide-react';
import { SOURCE_LABEL } from '@/lib/format';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

/* ---------- Buttons ---------- */
type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; loading?: boolean };

export function Button({ variant = 'primary', loading, className, children, disabled, ...rest }: BtnProps) {
    const styles = {
        primary: 'bg-brand-600 text-white hover:bg-brand-700 shadow-soft',
        secondary: 'bg-white text-brand-700 border border-brand-200 hover:bg-brand-50',
        ghost: 'text-brand-700 hover:bg-brand-50',
        danger: 'bg-danger text-white hover:bg-red-800',
    }[variant];
    return (
        <button
            {...rest}
            disabled={disabled || loading}
            className={cx('inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold transition disabled:opacity-60', styles, className)}
        >
            {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {children}
        </button>
    );
}

/* ---------- Form fields (always labelled) ---------- */
interface FieldShell {
    label: string;
    hint?: string;
    error?: string;
}

function Shell({ label, hint, error, id, children }: FieldShell & { id: string; children: ReactNode }) {
    return (
        <div className="space-y-1">
            <label htmlFor={id} className="block text-sm font-medium text-ink">
                {label}
            </label>
            {children}
            {hint && !error && <p className="text-xs text-muted">{hint}</p>}
            {error && (
                <p role="alert" className="text-xs font-medium text-danger">
                    {error}
                </p>
            )}
        </div>
    );
}

const inputCls = 'block min-h-11 w-full rounded-xl border border-sand-2 bg-white px-3 text-base text-ink placeholder:text-slate-400 focus:border-brand-500';

export function Input({ label, hint, error, ...rest }: FieldShell & InputHTMLAttributes<HTMLInputElement>) {
    const id = useId();
    return (
        <Shell {...{ label, hint, error, id }}>
            <input id={id} aria-invalid={!!error} aria-describedby={error ? id + '-e' : undefined} className={inputCls} {...rest} />
        </Shell>
    );
}

export function Select({ label, hint, error, children, ...rest }: FieldShell & SelectHTMLAttributes<HTMLSelectElement>) {
    const id = useId();
    return (
        <Shell {...{ label, hint, error, id }}>
            <select id={id} className={inputCls} {...rest}>
                {children}
            </select>
        </Shell>
    );
}

export function Textarea({ label, hint, error, ...rest }: FieldShell & TextareaHTMLAttributes<HTMLTextAreaElement>) {
    const id = useId();
    return (
        <Shell {...{ label, hint, error, id }}>
            <textarea id={id} rows={3} className={cx(inputCls, 'py-2')} {...rest} />
        </Shell>
    );
}

/** 1..n rating with text labels (not colour-only). */
export function Rating({ label, value, onChange, max = 5, lowText, highText }: { label: string; value: number | null; onChange(v: number | null): void; max?: number; lowText?: string; highText?: string }) {
    return (
        <fieldset className="space-y-1">
            <legend className="text-sm font-medium">{label}</legend>
            <div className="flex flex-wrap gap-2">
                {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
                    <button
                        key={n}
                        type="button"
                        aria-pressed={value === n}
                        onClick={() => onChange(value === n ? null : n)}
                        className={cx('h-11 w-11 rounded-full border text-sm font-semibold', value === n ? 'border-brand-600 bg-brand-600 text-white' : 'border-sand-2 bg-white hover:bg-brand-50')}
                    >
                        {n}
                    </button>
                ))}
            </div>
            {(lowText || highText) && (
                <p className="flex justify-between text-xs text-muted">
                    <span>{lowText}</span>
                    <span>{highText}</span>
                </p>
            )}
        </fieldset>
    );
}

/* ---------- Surfaces ---------- */
export function Card({ children, className, as: Tag = 'section', ...rest }: { children: ReactNode; className?: string; as?: 'section' | 'div' | 'article' } & React.HTMLAttributes<HTMLElement>) {
    return (
        <Tag {...rest} className={cx('rounded-3xl bg-white p-5 shadow-soft', className)}>
            {children}
        </Tag>
    );
}

export function PageHeader({ title, subtitle, image, action }: { title: string; subtitle?: string; image?: string; action?: ReactNode }) {
    return (
        <header className="mb-6 flex items-center gap-4 overflow-hidden rounded-3xl bg-brand-50 p-5">
            <div className="min-w-0 flex-1">
                <h1 className="text-2xl font-bold tracking-tight text-brand-900">{title}</h1>
                {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
                {action && <div className="mt-3">{action}</div>}
            </div>
            {image && <img src={image} alt="" width={160} height={100} loading="lazy" className="hidden h-24 w-40 shrink-0 object-contain sm:block" />}
        </header>
    );
}

type Tone = 'neutral' | 'ok' | 'warn' | 'danger' | 'info';
export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: Tone }) {
    const t = { neutral: 'bg-slate-100 text-slate-700', ok: 'bg-green-100 text-green-800', warn: 'bg-amber-100 text-amber-900', danger: 'bg-red-100 text-red-800', info: 'bg-sky-100 text-sky-800' }[tone];
    return <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold', t)}>{children}</span>;
}

export const SourceBadge = ({ source }: { source: string }) => <Badge tone={source === 'watch' ? 'info' : 'neutral'}>{SOURCE_LABEL[source] ?? source}</Badge>;

export function Spinner({ label = 'Chargement…' }: { label?: string }) {
    return (
        <div role="status" className="flex items-center justify-center gap-2 py-10 text-muted">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
            <span>{label}</span>
        </div>
    );
}

export function EmptyState({ title, text, image = '/images/illustrations/empty.svg', action }: { title: string; text?: string; image?: string; action?: ReactNode }) {
    return (
        <div className="flex flex-col items-center px-4 py-8 text-center">
            <img src={image} alt="" width={180} height={135} loading="lazy" className="mb-3 h-36 w-48" />
            <h3 className="text-base font-semibold">{title}</h3>
            {text && <p className="mt-1 max-w-sm text-sm text-muted">{text}</p>}
            {action && <div className="mt-4">{action}</div>}
        </div>
    );
}

export function ErrorState({ text, onRetry }: { text: string; onRetry?: () => void }) {
    const offline = text.includes('hors ligne');
    return (
        <EmptyState
            image={offline ? '/images/illustrations/offline.svg' : '/images/illustrations/error.svg'}
            title={offline ? 'Hors ligne' : 'Un problème est survenu'}
            text={text}
            action={onRetry && <Button variant="secondary" onClick={onRetry}>Réessayer</Button>}
        />
    );
}

export function Alert({ tone = 'info', children, title }: { tone?: 'info' | 'warn' | 'danger' | 'ok'; children: ReactNode; title?: string }) {
    const map = {
        info: ['bg-sky-50 border-sky-200 text-sky-900', Info],
        warn: ['bg-amber-50 border-amber-300 text-amber-900', AlertTriangle],
        danger: ['bg-red-50 border-red-300 text-red-900', AlertTriangle],
        ok: ['bg-green-50 border-green-200 text-green-900', CheckCircle2],
    } as const;
    const [cls, Icon] = map[tone];
    return (
        <div role={tone === 'danger' ? 'alert' : 'status'} className={cx('flex gap-3 rounded-2xl border p-4 text-sm', cls)}>
            <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
            <div>
                {title && <p className="font-semibold">{title}</p>}
                <div className="space-y-1">{children}</div>
            </div>
        </div>
    );
}

/* ---------- Accessible modal ---------- */
export function Modal({ open, onClose, title, children }: { open: boolean; onClose(): void; title: string; children: ReactNode }) {
    const ref = useRef<HTMLDialogElement>(null);
    useEffect(() => {
        const d = ref.current;
        if (!d) return;
        if (open && !d.open) d.showModal();
        if (!open && d.open) d.close();
    }, [open]);
    return (
        <dialog ref={ref} onClose={onClose} onCancel={onClose} aria-labelledby="modal-title" className="m-auto w-[min(92vw,32rem)] rounded-3xl p-0 backdrop:bg-black/40">
            <div className="p-6">
                <div className="mb-4 flex items-start justify-between gap-4">
                    <h2 id="modal-title" className="text-lg font-bold">
                        {title}
                    </h2>
                    <button type="button" onClick={onClose} aria-label="Fermer" className="grid h-11 w-11 place-items-center rounded-full hover:bg-slate-100">
                        <X className="h-5 w-5" />
                    </button>
                </div>
                {children}
            </div>
        </dialog>
    );
}

export function ConfirmButton({ children, message, onConfirm, ...rest }: { message: string; onConfirm(): void | Promise<void> } & BtnProps) {
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    return (
        <>
            <Button type="button" {...rest} onClick={() => setOpen(true)}>
                {children}
            </Button>
            <Modal open={open} onClose={() => setOpen(false)} title="Confirmer l'action">
                <p className="mb-5 text-sm">{message}</p>
                <div className="flex justify-end gap-2">
                    <Button variant="secondary" onClick={() => setOpen(false)}>Annuler</Button>
                    <Button
                        variant="danger"
                        loading={busy}
                        onClick={async () => {
                            setBusy(true);
                            try {
                                await onConfirm();
                            } finally {
                                setBusy(false);
                                setOpen(false);
                            }
                        }}
                    >
                        Confirmer
                    </Button>
                </div>
            </Modal>
        </>
    );
}

/* ---------- Toasts ---------- */
interface Toast { id: number; text: string; tone: 'ok' | 'warn' | 'danger' }
const ToastCtx = createContext<(text: string, tone?: Toast['tone']) => void>(() => undefined);
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);
    const push = useCallback((text: string, tone: Toast['tone'] = 'ok') => {
        const id = Date.now() + Math.random();
        setToasts((t) => [...t, { id, text, tone }]);
        setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000);
    }, []);
    return (
        <ToastCtx.Provider value={push}>
            {children}
            <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex flex-col items-center gap-2 px-4 lg:bottom-6">
                {toasts.map((t) => (
                    <div key={t.id} className={cx('pointer-events-auto max-w-md rounded-2xl px-4 py-3 text-sm font-medium text-white shadow-lg', t.tone === 'ok' ? 'bg-brand-700' : t.tone === 'warn' ? 'bg-amber-700' : 'bg-danger')}>
                        {t.text}
                    </div>
                ))}
            </div>
        </ToastCtx.Provider>
    );
}
