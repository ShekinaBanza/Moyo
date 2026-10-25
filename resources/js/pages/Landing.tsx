import { Link } from 'react-router-dom';
import { Activity, Apple, Bed, HeartPulse, Ruler, ShieldCheck, Watch } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

const FEATURES = [
    { icon: Bed, title: 'Sommeil', text: 'Durée réelle, régularité et ressenti au réveil.', img: '/images/illustrations/sleep.svg' },
    { icon: Apple, title: 'Repas', text: "Un catalogue d'aliments courants en RDC : foufou, riz, haricots, poisson…", img: '/images/foods/foufou.svg' },
    { icon: Activity, title: 'Activité', text: 'Pas, marche et effort perçu, saisis à la main ou importés.', img: '/images/illustrations/activity.svg' },
    { icon: HeartPulse, title: 'Symptômes', text: 'Un historique clair à montrer à un professionnel de santé.', img: '/images/illustrations/wellbeing.svg' },
    { icon: Ruler, title: 'Mesures', text: 'Poids et tour de taille sur la durée, sans interprétation hâtive.', img: '/images/illustrations/body.svg' },
    { icon: Activity, title: 'Habitudes', text: 'Des petits rituels réalistes et des rappels que vous choisissez.', img: '/images/illustrations/habits.svg' },
];

export default function Landing() {
    const { user } = useAuth();
    return (
        <div className="min-h-screen bg-sand">
            <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 lg:px-8">
                <Link to="/" className="flex items-center gap-2 text-xl font-extrabold text-brand-700">
                    <img src="/icons/icon.svg" alt="" width={36} height={36} className="h-9 w-9" /> Moyo
                </Link>
                <nav aria-label="Compte" className="flex items-center gap-2">
                    {user ? (
                        <Link to="/app" className="inline-flex min-h-11 items-center rounded-full bg-brand-600 px-5 text-sm font-semibold text-white">Ouvrir mon espace</Link>
                    ) : (
                        <>
                            <Link to="/login" className="inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold text-brand-700 hover:bg-brand-50">Se connecter</Link>
                            <Link to="/register" className="inline-flex min-h-11 items-center rounded-full bg-brand-600 px-5 text-sm font-semibold text-white shadow-soft">Créer un compte</Link>
                        </>
                    )}
                </nav>
            </header>

            <section className="mx-auto grid max-w-6xl items-center gap-8 px-4 pb-12 pt-6 lg:grid-cols-2 lg:px-8 lg:pt-14">
                <div className="fade-up">
                    <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-brand-200 bg-white px-3 py-1 text-xs font-semibold text-brand-700">
                        <ShieldCheck className="h-4 w-4" aria-hidden /> Vos données de santé restent à vous
                    </p>
                    <h1 className="text-4xl font-extrabold leading-tight tracking-tight text-brand-900 sm:text-5xl">
                        Comprenez vos habitudes. <span className="headline-accent">Jour après jour.</span>
                    </h1>
                    <p className="mt-4 max-w-xl text-lg text-muted">
                        Moyo vous aide à suivre votre sommeil, vos repas, votre activité, vos mesures et vos symptômes, avec ou sans montre connectée. Une observation simple, sans diagnostic ni pression.
                    </p>
                    <div className="mt-6 flex flex-wrap gap-3">
                        <Link to="/register" className="inline-flex min-h-12 items-center rounded-full bg-brand-600 px-7 text-base font-semibold text-white shadow-soft hover:bg-brand-700">Commencer gratuitement</Link>
                        <Link to="/login" className="inline-flex min-h-12 items-center rounded-full border border-brand-200 bg-white px-7 text-base font-semibold text-brand-700">J'ai déjà un compte</Link>
                    </div>
                </div>
                <img src="/images/illustrations/hero.svg" alt="Une personne marche au lever du soleil, entourée de feuilles" width={480} height={400} className="fade-up mx-auto w-full max-w-md rounded-[2.25rem] shadow-soft" />
            </section>

            <section aria-labelledby="f" className="mx-auto max-w-6xl px-4 py-10 lg:px-8">
                <h2 id="f" className="text-2xl font-bold text-brand-900">Un carnet de santé personnel, simple à tenir</h2>
                <p className="mt-1 text-muted">Tout ce qui compte, sur un seul écran, sans surcharge d'indicateurs.</p>
                <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {FEATURES.map((f) => (
                        <li key={f.title} className="overflow-hidden rounded-3xl bg-white shadow-soft">
                            <img src={f.img} alt="" width={480} height={300} loading="lazy" className="h-40 w-full bg-brand-50 object-contain p-3" />
                            <div className="p-5">
                                <h3 className="flex items-center gap-2 font-bold"><f.icon className="h-5 w-5 text-brand-600" aria-hidden /> {f.title}</h3>
                                <p className="mt-1 text-sm text-muted">{f.text}</p>
                            </div>
                        </li>
                    ))}
                </ul>
            </section>

            <section aria-labelledby="w" className="mx-auto max-w-6xl px-4 py-10 lg:px-8">
                <div className="grid items-center gap-6 rounded-[2rem] bg-brand-800 p-6 text-white lg:grid-cols-2 lg:p-10">
                    <img src="/images/illustrations/watch.svg" alt="Montre connectée avec signal Bluetooth" width={480} height={300} loading="lazy" className="w-full max-w-sm rounded-3xl" />
                    <div>
                        <h2 id="w" className="flex items-center gap-2 text-2xl font-bold"><Watch className="h-6 w-6" aria-hidden /> Une montre ? Facultative.</h2>
                        <p className="mt-3 text-brand-100">Tout fonctionne en saisie manuelle sur votre téléphone. Si vous possédez une montre compatible, vous pourrez l'associer plus tard. Une mesure n'apparaît que si elle a réellement été reçue et comprise.</p>
                        <p className="mt-3 inline-block rounded-full bg-white/15 px-3 py-1 text-sm font-semibold">Intégration en cours de vérification</p>
                    </div>
                </div>
            </section>

            <section className="mx-auto max-w-6xl px-4 pb-16 pt-6 lg:px-8">
                <p className="rounded-3xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-900">
                    <strong>Important :</strong> Moyo observe vos habitudes. L'application ne pose aucun diagnostic, ne remplace pas un professionnel de santé et n'a pas la précision d'un dispositif médical. En cas d'essoufflement important au repos, de douleur thoracique ou d'évanouissement, cherchez immédiatement une aide médicale.
                </p>
            </section>

            <footer className="border-t border-sand-2 py-6 text-center text-sm text-muted">© Moyo — compagnon santé et habitudes</footer>
        </div>
    );
}
