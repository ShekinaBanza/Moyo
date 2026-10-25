import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ApiError, post } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { Alert, Button, Input, Spinner } from '@/components/ui';

function Shell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
    return (
        <div className="grid min-h-screen bg-sand lg:grid-cols-2">
            <div className="hidden bg-brand-600 p-10 lg:flex lg:flex-col lg:justify-center">
                <img src="/images/illustrations/login.svg" alt="Bouclier de confidentialité orné d'une feuille" width={480} height={400} className="mx-auto w-full max-w-md rounded-[2rem]" />
            </div>
            <div className="flex items-center justify-center px-4 py-10">
                <div className="w-full max-w-md">
                    <Link to="/" className="mb-6 flex items-center gap-2 text-xl font-extrabold text-brand-700">
                        <img src="/icons/icon.svg" alt="" width={32} height={32} className="h-8 w-8" /> Moyo
                    </Link>
                    <h1 className="text-3xl font-extrabold tracking-tight text-brand-900">{title}</h1>
                    <p className="mb-6 mt-1 text-muted">{subtitle}</p>
                    {children}
                </div>
            </div>
        </div>
    );
}

function useForm() {
    const [errors, setErrors] = useState<Record<string, string[]>>({});
    const [message, setMessage] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    async function run(fn: () => Promise<void>) {
        setBusy(true);
        setErrors({});
        setMessage(null);
        try {
            await fn();
        } catch (e) {
            if (e instanceof ApiError) {
                setErrors(e.errors);
                setMessage(Object.keys(e.errors).length ? null : e.message);
            } else setMessage('Connexion impossible. Vérifiez votre réseau et réessayez.');
        } finally {
            setBusy(false);
        }
    }
    return { errors, message, busy, run, err: (k: string) => errors[k]?.[0] };
}

export function Login() {
    const { user, loading, login } = useAuth();
    const nav = useNavigate();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const f = useForm();
    if (loading) return <Spinner />;
    if (user) return <Navigate to="/app" replace />;
    const submit = (e: FormEvent) => {
        e.preventDefault();
        void f.run(async () => {
            await login(email, password);
            nav('/app');
        });
    };
    return (
        <Shell title="Bon retour" subtitle="Connectez-vous pour retrouver votre journal.">
            <form onSubmit={submit} className="space-y-4" noValidate>
                {f.message && <Alert tone="danger">{f.message}</Alert>}
                <Input label="Adresse e-mail" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} error={f.err('email')} />
                <Input label="Mot de passe" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} error={f.err('password')} />
                <Button type="submit" className="w-full" loading={f.busy}>Se connecter</Button>
            </form>
            <p className="mt-4 text-sm"><Link className="font-semibold text-brand-700 underline" to="/forgot">Mot de passe oublié ?</Link></p>
            <p className="mt-2 text-sm text-muted">Pas encore de compte ? <Link className="font-semibold text-brand-700 underline" to="/register">Créer un compte</Link></p>
        </Shell>
    );
}

export function Register() {
    const { user, loading, register } = useAuth();
    const nav = useNavigate();
    const [v, setV] = useState({ name: '', email: '', password: '', password_confirmation: '', consent_health_data: false });
    const f = useForm();
    if (loading) return <Spinner />;
    if (user) return <Navigate to="/app" replace />;
    const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
    const submit = (e: FormEvent) => {
        e.preventDefault();
        void f.run(async () => {
            await register(v);
            nav('/app');
        });
    };
    return (
        <Shell title="Créer votre compte" subtitle="Gratuit. Aucune montre n'est nécessaire.">
            <form onSubmit={submit} className="space-y-4" noValidate>
                {f.message && <Alert tone="danger">{f.message}</Alert>}
                <Input label="Prénom ou nom" autoComplete="name" required value={v.name} onChange={set('name')} error={f.err('name')} />
                <Input label="Adresse e-mail" type="email" autoComplete="email" required value={v.email} onChange={set('email')} error={f.err('email')} />
                <Input label="Mot de passe" type="password" autoComplete="new-password" required value={v.password} onChange={set('password')} hint="10 caractères minimum, avec lettres et chiffres." error={f.err('password')} />
                <Input label="Confirmer le mot de passe" type="password" autoComplete="new-password" required value={v.password_confirmation} onChange={set('password_confirmation')} />
                <div>
                    <label className="flex items-start gap-3 text-sm">
                        <input type="checkbox" className="mt-1 h-5 w-5" checked={v.consent_health_data} onChange={set('consent_health_data')} />
                        <span>J'accepte que mes données de santé saisies soient enregistrées sur ce service pour mon propre suivi. Je peux les exporter ou supprimer mon compte à tout moment.</span>
                    </label>
                    {f.err('consent_health_data') && <p role="alert" className="mt-1 text-xs font-medium text-danger">Ce consentement est nécessaire pour utiliser le service.</p>}
                </div>
                <Button type="submit" className="w-full" loading={f.busy}>Créer mon compte</Button>
            </form>
            <p className="mt-4 text-sm text-muted">Déjà inscrit ? <Link className="font-semibold text-brand-700 underline" to="/login">Se connecter</Link></p>
        </Shell>
    );
}

export function Forgot() {
    const [email, setEmail] = useState('');
    const [done, setDone] = useState<string | null>(null);
    const f = useForm();
    return (
        <Shell title="Mot de passe oublié" subtitle="Nous vous enverrons un lien si un compte existe.">
            <form
                className="space-y-4"
                onSubmit={(e) => {
                    e.preventDefault();
                    void f.run(async () => setDone((await post<{ message: string }>('/api/v1/auth/forgot-password', { email })).message));
                }}
            >
                {f.message && <Alert tone="danger">{f.message}</Alert>}
                {done && <Alert tone="ok">{done}</Alert>}
                <Input label="Adresse e-mail" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} error={f.err('email')} />
                <Button type="submit" className="w-full" loading={f.busy}>Envoyer le lien</Button>
            </form>
            <p className="mt-4 text-sm"><Link className="font-semibold text-brand-700 underline" to="/login">Retour à la connexion</Link></p>
        </Shell>
    );
}
