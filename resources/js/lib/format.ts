export const NA = 'Non disponible';

export function fmtDuration(minutes: number | null | undefined): string {
    if (minutes === null || minutes === undefined) return NA;
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return h > 0 ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`;
}

export function fmtDateTime(iso: string | null | undefined): string {
    if (!iso) return NA;
    return new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function fmtDate(iso: string | null | undefined): string {
    if (!iso) return NA;
    return new Date(iso.length === 10 ? iso + 'T00:00:00' : iso).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function fmtNumber(n: number | null | undefined, unit = ''): string {
    if (n === null || n === undefined) return NA;
    return `${n.toLocaleString('fr-FR')}${unit ? ' ' + unit : ''}`;
}

/** Value for <input type="datetime-local"> in the user's local timezone. */
export function toLocalInput(d: Date = new Date()): string {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Local datetime-local value -> ISO string with the real UTC offset, so the server stores the right instant. */
export function localInputToIso(v: string): string {
    return new Date(v).toISOString();
}

export function localDate(d: Date = new Date()): string {
    return toLocalInput(d).slice(0, 10);
}

export function minuteToClock(m: number): string {
    const mm = ((m % 1440) + 1440) % 1440;
    return `${String(Math.floor(mm / 60)).padStart(2, '0')}:${String(mm % 60).padStart(2, '0')}`;
}

export const SOURCE_LABEL: Record<string, string> = { manual: 'Saisie manuelle', watch: 'Montre', imported: 'Importé', gps: 'GPS' };

export const SYMPTOM_LABEL: Record<string, string> = {
    breathlessness: 'Essoufflement',
    swelling: 'Gonflement',
    fatigue: 'Fatigue',
    pain: 'Douleur',
    dizziness: 'Vertiges',
    post_meal_discomfort: 'Inconfort après un repas',
    chest_pain: 'Douleur thoracique',
    fainting: 'Évanouissement',
    other: 'Autre',
};

export const MEAL_LABEL: Record<string, string> = { breakfast: 'Petit-déjeuner', lunch: 'Déjeuner', dinner: 'Dîner', snack: 'Collation', drink: 'Boisson' };
export const UNIT_LABEL: Record<string, string> = { small: 'petite portion', medium: 'portion moyenne', large: 'grande portion', g: 'g', ml: 'ml', piece: 'pièce(s)', spoon: 'cuillère(s)', cup: 'tasse(s)' };
export const ACTIVITY_LABEL: Record<string, string> = { walking: 'Marche', steps: 'Pas (total)', running: 'Course', cycling: 'Vélo', housework: 'Travaux ménagers', other: 'Autre' };
export const NUTRITION_LABEL: Record<string, string> = { verified: 'Valeur vérifiée', estimated: 'Valeur estimée', unknown: 'Valeur inconnue' };

export function fmtKcal(n: number | null | undefined): string {
    if (n === null || n === undefined) return NA;
    return `${Math.round(n).toLocaleString('fr-FR')} kcal`;
}

export function fmtSigned(n: number | null | undefined): string {
    if (n === null || n === undefined) return NA;
    const r = Math.round(n);
    return `${r > 0 ? '+' : r < 0 ? '−' : ''}${Math.abs(r).toLocaleString('fr-FR')} kcal`;
}

export const ACTIVITY_CATEGORY_LABEL: Record<string, string> = { marche: 'Marche', course: 'Course', velo: 'Vélo', sport: 'Sport et danse', maison: 'Maison et jardin', travail: 'Travail', autre: 'Autre' };
export const QUALITY_LABEL: Record<string, string> = { good: 'Estimation standard', low: 'Estimation grossière', unavailable: 'Non estimable' };
export const TRACK_STATUS_LABEL: Record<string, string> = { recording: 'En cours', paused: 'En pause', finished: 'Terminé', interrupted: 'Interrompu' };
