<?php

namespace App\Services;

use App\Models\SymptomEntry;
use App\Models\User;
use Illuminate\Support\Carbon;

/**
 * Centralised, versioned safety rules. These rules are NOT a diagnosis: they only
 * decide which safety message is shown and whether activity progression is offered.
 * Wearable data is deliberately never an input: it cannot cancel declared symptoms.
 *
 * v1 rules
 *  R1 emergency: chest_pain or fainting in the last 24h, OR breathlessness at rest with
 *     intensity >= 7 in the last 24h.
 *  R2 prompt_evaluation: breathlessness AND swelling both recorded in the last 14 days.
 *  R3 caution: breathlessness or swelling recorded in the last 14 days (single type).
 *  R4 activity progression is NOT offered if level != none, or if a warning symptom was
 *     recorded in the last 30 days and the user has not declared a professional evaluation.
 */
class SafetyService
{
    public const RULES_VERSION = 'safety-rules-v1';

    public function evaluate(User $user, ?Carbon $now = null): array
    {
        $now ??= now();
        $recent = SymptomEntry::where('user_id', $user->id)
            ->where('occurred_at', '>=', $now->copy()->subDays(30))
            ->get(['symptom_type', 'intensity', 'at_rest', 'occurred_at']);

        $within = fn ($days) => $recent->filter(fn ($s) => $s->occurred_at->greaterThanOrEqualTo($now->copy()->subDays($days)));
        $last24 = $within(1);
        $last14 = $within(14);

        $level = 'none';
        $messages = [];

        $emergency = $last24->contains(fn ($s) => in_array($s->symptom_type, ['chest_pain', 'fainting'], true))
            || $last24->contains(fn ($s) => $s->symptom_type === 'breathlessness' && $s->at_rest === true && $s->intensity >= 7);

        $hasBreath = $last14->contains(fn ($s) => $s->symptom_type === 'breathlessness' && $s->intensity > 0);
        $hasSwelling = $last14->contains(fn ($s) => $s->symptom_type === 'swelling' && $s->intensity > 0);

        if ($emergency) {
            $level = 'emergency';
            $messages[] = ['code' => 'R1_EMERGENCY', 'text' => "Vous avez signalé un symptôme d'alerte (douleur thoracique, évanouissement ou essoufflement important au repos). Cherchez une aide médicale urgente maintenant : rendez-vous aux urgences ou appelez les secours. Cette application ne peut pas évaluer votre situation."];
        } elseif ($hasBreath && $hasSwelling) {
            $level = 'prompt_evaluation';
            $messages[] = ['code' => 'R2_PROMPT_EVALUATION', 'text' => "Vous avez noté un essoufflement et des gonflements récemment. Nous vous recommandons une réévaluation médicale rapide. Ceci n'est pas un diagnostic. Vous pouvez présenter votre historique au professionnel de santé."];
        } elseif ($hasBreath || $hasSwelling) {
            $level = 'caution';
            $messages[] = ['code' => 'R3_CAUTION', 'text' => "Vous avez noté un symptôme à surveiller. S'il persiste, s'aggrave ou vous inquiète, parlez-en à un professionnel de santé."];
        }

        $profile = $user->healthProfile()->first(); // fresh read: never a cached relation
        $evaluated = $profile?->evaluated_by_professional === true;
        $warningInMonth = $recent->contains(fn ($s) => in_array($s->symptom_type, ['breathlessness', 'swelling', 'chest_pain', 'fainting'], true) && $s->intensity > 0);

        $progressionAllowed = $level === 'none' && ! ($warningInMonth && ! $evaluated);
        if (! $progressionAllowed) {
            $messages[] = ['code' => 'R4_NO_PROGRESSION', 'text' => "L'application ne propose pas d'augmenter l'intensité de l'activité tant que ces signes n'ont pas été évalués par un professionnel de santé."];
        }

        return [
            'level' => $level,
            'messages' => $messages,
            'activity_progression_allowed' => $progressionAllowed,
            'evaluated_by_professional' => $profile?->evaluated_by_professional,
            'rules_version' => self::RULES_VERSION,
            'disclaimer' => "Application d'observation des habitudes. Elle ne pose aucun diagnostic et ne remplace pas un professionnel de santé.",
        ];
    }
}
