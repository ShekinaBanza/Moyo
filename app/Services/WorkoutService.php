<?php

namespace App\Services;

use App\Models\ActivityCatalogItem;
use App\Models\ActivityEntry;
use App\Models\Exercise;
use App\Models\User;
use App\Models\WorkoutSession;
use Illuminate\Support\Collection;

/**
 * Safety gate, energy estimate and journal integration for workout sessions.
 * The gate reuses the medical safety rules (SafetyService): exercise advice never overrides declared symptoms.
 */
class WorkoutService
{
    public function __construct(private SafetyService $safety, private EnergyService $energy) {}

    /**
     * open       : all exercises available.
     * restricted : warning symptoms (breathlessness / swelling...) not yet evaluated -> mobility only, no progression.
     * blocked    : emergency signs -> no exercise at all, urgent medical advice.
     *
     * @return array{mode:string,level:string,messages:array,allowed_categories:array,rules_version:string}
     */
    public function access(User $user): array
    {
        $s = $this->safety->evaluate($user);
        $mode = $s['level'] === 'emergency' ? 'blocked' : ($s['activity_progression_allowed'] ? 'open' : 'restricted');
        $messages = $s['messages'];
        if ($mode === 'restricted') {
            $messages[] = ['code' => 'EX_RESTRICTED', 'text' => "Par prudence, seuls les exercices de mobilité et d'étirements doux sont proposés. Moyo ne recommande pas de musculation intense, d'abdominaux exigeants ni d'objectifs sportifs plus élevés avant une évaluation médicale. Si vous avez été évalué(e), indiquez-le dans votre profil."];
        }
        if ($mode === 'blocked') {
            $messages[] = ['code' => 'EX_BLOCKED', 'text' => "Aucune séance n'est proposée tant que ces signes d'alerte ne sont pas pris en charge. Cherchez une aide médicale urgente."];
        }

        return [
            'mode' => $mode,
            'level' => $s['level'],
            'messages' => $messages,
            'allowed_categories' => match ($mode) {
                'open' => ['musculation', 'abdominaux', 'mobilite', 'general'],
                'restricted' => ['mobilite'],
                default => [],
            },
            'rules_version' => $s['rules_version'],
        ];
    }

    /** @param Collection<int,Exercise> $exercises */
    public function catalogSlugFor(Collection $exercises): string
    {
        $counts = $exercises->countBy('category');
        $top = $counts->sortDesc()->keys()->first() ?? 'general';

        return match ($top) {
            'abdominaux' => 'seance-abdominaux',
            'mobilite' => 'seance-mobilite',
            'general' => 'renforcement-general',
            default => 'seance-musculation',
        };
    }

    /** NET kcal above rest, an ESTIMATE from the MET model (same formula as the energy balance). */
    public function estimate(User $user, string $catalogSlug, int $effectiveSeconds, \Illuminate\Support\Carbon $at): array
    {
        $cat = ActivityCatalogItem::where('slug', $catalogSlug)->first();
        $minutes = max(1, (int) ceil($effectiveSeconds / 60));
        $weight = $this->energy->resolveWeight($user, $at);
        $e = EnergyCalculator::activityEstimate($cat?->met, false, $weight, $minutes, null);
        $e['weight_kg'] = $weight;
        $e['catalog_slug'] = $catalogSlug;
        $e['method'] = $e['net_kcal'] === null
            ? 'Estimation impossible : '.implode(', ', $e['missing']).' manquant(s).'
            : sprintf('Estimation (pas une mesure) : (MET %s − 1) × 3,5 × %s kg ÷ 200 × %d min, MET moyen de la catégorie « %s ». Dépense nette au-dessus du repos.', $e['met'], rtrim(rtrim(number_format($weight, 1, ',', ''), '0'), ','), $minutes, $cat->name);

        return $e;
    }

    /** Activities of the user overlapping the session window (possible double counting). */
    public function overlapping(User $user, WorkoutSession $s): Collection
    {
        return ActivityEntry::where('user_id', $user->id)
            ->whereBetween('started_at', [$s->started_at->copy()->subDay(), $s->ended_at->copy()->addDay()])
            ->get()
            ->filter(function (ActivityEntry $a) use ($s) {
                $end = $a->started_at->copy()->addMinutes($a->duration_minutes ?? 0);

                return $a->started_at->lessThan($s->ended_at) && $end->greaterThanOrEqualTo($s->started_at);
            })->values();
    }
}
