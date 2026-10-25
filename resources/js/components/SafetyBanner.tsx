import { Link } from 'react-router-dom';
import { HeartPulse } from 'lucide-react';
import { Alert } from '@/components/ui';
import type { SafetyStatus } from '@/types';

/**
 * Shows the backend safety decision as-is. It never depends on a wearable value or on a score,
 * and it has no reassuring illustration so that it cannot mask the message.
 */
export function SafetyBanner({ safety, compact = false }: { safety: SafetyStatus | null | undefined; compact?: boolean }) {
    if (!safety || safety.level === 'none') {
        return compact ? null : (
            <p className="text-xs text-muted">
                <HeartPulse className="mr-1 inline h-3.5 w-3.5" aria-hidden />
                {safety?.disclaimer ?? "Application d'observation des habitudes : elle ne pose aucun diagnostic et ne remplace pas un professionnel de santé."}
            </p>
        );
    }
    const tone = safety.level === 'emergency' ? 'danger' : safety.level === 'prompt_evaluation' ? 'warn' : 'info';
    const title = { emergency: 'Aide médicale urgente recommandée', prompt_evaluation: 'Réévaluation médicale rapide recommandée', caution: 'Symptôme à surveiller' }[safety.level];
    return (
        <Alert tone={tone} title={title}>
            {safety.messages.map((m) => (
                <p key={m.code}>{m.text}</p>
            ))}
            <p>
                <Link to="/app/symptoms" className="font-semibold underline">
                    Voir et partager mon historique de symptômes
                </Link>
            </p>
        </Alert>
    );
}
