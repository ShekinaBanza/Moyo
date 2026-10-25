<?php

namespace App\Services;

use App\Models\ActivityCatalogItem;
use App\Models\ActivityEntry;
use App\Models\BodyMeasurement;
use App\Models\FoodEntry;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

/**
 * Builds the daily energy balance from the user's own records. Nothing is stored: every figure is
 * recomputed on demand, so editing or deleting an entry updates the balance with no manual step.
 *
 * Strategy against double counting (documented in docs/ENERGY.md):
 *   total expenditure = resting metabolic rate (24 h)  +  NET activity energy
 * Gross activity energy is shown for information only and is never added to the total.
 * Wearable calories are not used: their definition (active / total) is unconfirmed.
 */
class EnergyService
{
    public const TOLERANCE_KCAL = 100;

    public function timezone(User $user): string
    {
        return $user->healthProfile()->value('timezone') ?: config('app.timezone');
    }

    /** @return array<string,mixed> */
    public function daily(User $user, string $date): array
    {
        $days = $this->range($user, $date, $date, true);

        return $days[0];
    }

    /** @return array<int,array<string,mixed>> compact rows, one per day, oldest first */
    public function history(User $user, string $from, string $to): array
    {
        return array_map(fn ($d) => [
            'date' => $d['date'],
            'consumed_kcal' => $d['consumed']['total_kcal'],
            'expenditure_kcal' => $d['expenditure']['total_kcal'],
            'balance_kcal' => $d['balance']['kcal'],
            'status' => $d['balance']['status'],
            'complete' => $d['balance']['complete'],
        ], $this->range($user, $from, $to, false));
    }

    /** Per-entry estimates for a list of activity entries (used by the activity journal). */
    public function estimateEntries(User $user, Collection $entries): Collection
    {
        $tz = $this->timezone($user);
        $weights = $this->weights($user);
        $catalog = ActivityCatalogItem::all()->keyBy('id');

        return $entries->mapWithKeys(fn (ActivityEntry $e) => [
            $e->id => $this->entryEstimate($e, $catalog, $weights, $tz),
        ]);
    }

    /** @return array<int,array<string,mixed>> */
    private function range(User $user, string $from, string $to, bool $detailed): array
    {
        $tz = $this->timezone($user);
        $start = Carbon::parse($from, $tz)->startOfDay();
        $end = Carbon::parse($to, $tz)->endOfDay();

        $foods = FoodEntry::where('user_id', $user->id)->whereBetween('eaten_at', [$start->copy()->utc(), $end->copy()->utc()])->get()
            ->groupBy(fn ($f) => $f->eaten_at->copy()->setTimezone($tz)->toDateString());
        $acts = ActivityEntry::where('user_id', $user->id)->whereBetween('started_at', [$start->copy()->utc(), $end->copy()->utc()])->get()
            ->groupBy(fn ($a) => $a->started_at->copy()->setTimezone($tz)->toDateString());
        $weights = $this->weights($user);
        $catalog = ActivityCatalogItem::all()->keyBy('id');
        $profile = $user->healthProfile()->first();
        $today = Carbon::now($tz)->toDateString();

        $out = [];
        for ($d = $start->copy(); $d->lessThanOrEqualTo($end); $d->addDay()) {
            $date = $d->toDateString();
            $out[] = $this->buildDay($date, $tz, $today, $profile, $foods->get($date, collect()), $acts->get($date, collect()), $weights, $catalog, $detailed);
        }

        return $out;
    }

    /** latest weight measurements, newest first: [['at'=>Carbon,'kg'=>float]] */
    private function weights(User $user): Collection
    {
        return BodyMeasurement::where('user_id', $user->id)->where('kind', 'weight')->orderByDesc('measured_at')->get(['value', 'measured_at'])
            ->map(fn ($m) => ['at' => $m->measured_at, 'kg' => (float) $m->value]);
    }

    /** Most recent weight measured at or before the given instant. */
    /** Public helper: the weight (kg) the energy model would use at a given instant, or null. */
    public function resolveWeight(User $user, Carbon $at): ?float
    {
        return $this->weightAt($this->weights($user), $at);
    }

    private function weightAt(Collection $weights, Carbon $at): ?float
    {
        return $weights->first(fn ($w) => $w['at']->lessThanOrEqualTo($at))['kg'] ?? null;
    }

    private function entryEstimate(ActivityEntry $e, Collection $catalog, Collection $weights, string $tz): array
    {
        $item = $e->catalog_id ? $catalog->get($e->catalog_id) : null;
        $weightSource = null;
        $kg = $e->weight_kg;
        if ($kg !== null) {
            $weightSource = 'entry';
        } else {
            $kg = $this->weightAt($weights, $e->started_at);
            $weightSource = $kg !== null ? 'measurement' : null;
        }
        $est = EnergyCalculator::activityEstimate($item?->met, $item === null || $item->is_custom, $kg, $e->duration_minutes, $e->perceived_effort);
        if ($item === null) {
            // legacy entry without a catalogue item: no MET known
            $est = ['gross_kcal' => null, 'net_kcal' => null, 'met' => null, 'quality' => 'unavailable', 'assumptions' => [], 'missing' => array_values(array_unique(array_merge($est['missing'], ['activité du catalogue'])))];
        }

        return $est + ['weight_kg' => $kg, 'weight_source' => $weightSource];
    }

    private function buildDay(string $date, string $tz, string $today, $profile, Collection $foods, Collection $acts, Collection $weights, Collection $catalog, bool $detailed): array
    {
        // ---- consumed ----
        $withKcal = $foods->filter(fn ($f) => $f->kcal !== null && in_array($f->nutrition_status, ['verified', 'estimated'], true));
        $missingFood = $foods->diff($withKcal);
        $byMeal = $foods->groupBy('meal_type')->map(fn ($g, $type) => [
            'meal_type' => $type,
            'kcal' => $g->whereNotNull('kcal')->count() ? round($g->whereNotNull('kcal')->sum('kcal'), 1) : null,
            'entries' => $g->count(),
            'missing' => $g->whereNull('kcal')->count(),
        ])->values()->all();
        $consumedTotal = $withKcal->isEmpty() ? null : round($withKcal->sum('kcal'), 1);

        // ---- activities ----
        $items = $acts->map(function (ActivityEntry $a) use ($catalog, $weights, $tz) {
            $est = $this->entryEstimate($a, $catalog, $weights, $tz);
            $cat = $a->catalog_id ? $catalog->get($a->catalog_id) : null;

            return [
                'id' => $a->id,
                'name' => $a->custom_label ?: ($cat?->name ?? $a->activity_type),
                'minutes' => $a->duration_minutes,
                'source' => $a->source_type,
            ] + $est;
        })->values();
        $available = $items->where('quality', '!=', 'unavailable');
        $netSum = $available->count() ? round($available->sum('net_kcal'), 1) : ($items->isEmpty() ? 0.0 : null);
        $grossSum = $available->count() ? round($available->sum('gross_kcal'), 1) : null;

        // ---- resting metabolic rate ----
        $ref = Carbon::parse($date, $tz)->endOfDay();
        $kgRest = $this->weightAt($weights, $ref);
        $age = $profile?->birth_date ? (int) $profile->birth_date->diffInYears(Carbon::parse($date, $tz), true) : null;
        $restMissing = [];
        if (! in_array($profile?->sex, ['male', 'female'], true)) {
            $restMissing[] = 'sexe (homme ou femme : la formule utilisée est binaire)';
        }
        if ($age === null) {
            $restMissing[] = 'date de naissance';
        }
        if ($profile?->height_cm === null) {
            $restMissing[] = 'taille';
        }
        if ($kgRest === null) {
            $restMissing[] = 'poids (une pesée dans les mesures corporelles)';
        }
        $rest = EnergyCalculator::restingKcal($profile?->sex, $age, $profile?->height_cm, $kgRest);
        $rest = $rest === null ? null : round($rest, 0);

        $expTotal = $rest === null || $netSum === null ? null : round($rest + $netSum, 0);

        // ---- balance ----
        $reasons = [];
        if ($consumedTotal === null) {
            $reasons[] = $foods->isEmpty() ? 'Aucun repas enregistré ce jour.' : "Aucun repas n'a de valeur calorique (valeur inconnue).";
        }
        if ($rest === null) {
            $reasons[] = 'Métabolisme de repos non calculable : '.implode(', ', $restMissing).'.';
        }
        if ($netSum === null) {
            $reasons[] = "Aucune activité n'a pu être estimée (durée, poids ou intensité manquants).";
        }
        $balance = ($consumedTotal === null || $expTotal === null) ? null : round($consumedTotal - $expTotal, 0);
        $incomplete = [];
        if ($missingFood->isNotEmpty()) {
            $incomplete[] = $missingFood->count().' repas sans valeur calorique ne sont pas comptés.';
        }
        if ($items->where('quality', 'unavailable')->isNotEmpty()) {
            $incomplete[] = $items->where('quality', 'unavailable')->count().' activité(s) non estimable(s) ne sont pas comptées.';
        }
        if ($date === $today) {
            $incomplete[] = 'La journée n\'est pas terminée : le bilan peut encore changer.';
        }
        $complete = $balance !== null && $missingFood->isEmpty() && $items->where('quality', 'unavailable')->isEmpty() && $date < $today;

        $day = [
            'date' => $date,
            'timezone' => $tz,
            'consumed' => [
                'total_kcal' => $consumedTotal,
                'verified_kcal' => $withKcal->where('nutrition_status', 'verified')->count() ? round($withKcal->where('nutrition_status', 'verified')->sum('kcal'), 1) : null,
                'estimated_kcal' => $withKcal->where('nutrition_status', 'estimated')->count() ? round($withKcal->where('nutrition_status', 'estimated')->sum('kcal'), 1) : null,
                'entries' => $foods->count(),
                'entries_with_kcal' => $withKcal->count(),
                'missing' => $missingFood->map(fn ($f) => ['id' => $f->id, 'name' => $f->name, 'meal_type' => $f->meal_type])->values()->all(),
                'by_meal' => $byMeal,
            ],
            'expenditure' => [
                'resting' => ['kcal' => $rest, 'method' => 'Mifflin-St Jeor', 'missing' => $rest === null ? $restMissing : []],
                'activities' => [
                    'net_kcal' => $netSum,
                    'gross_kcal_info_only' => $grossSum,
                    'items' => $items->all(),
                ],
                'total_kcal' => $expTotal,
                'formula' => 'Dépense totale estimée = métabolisme de repos (24 h) + dépense NETTE des activités. La dépense brute n\'est jamais ajoutée.',
            ],
            'balance' => [
                'kcal' => $balance,
                'status' => $balance === null ? null : EnergyCalculator::balanceStatus($balance, self::TOLERANCE_KCAL),
                'complete' => $complete,
                'reasons' => $reasons,
                'caveats' => $incomplete,
            ],
            'watch_energy' => ['used' => false, 'reason' => "Les calories d'une montre ne sont pas utilisées : leur définition (actives, totales ou autre) n'est pas confirmée."],
        ];

        if ($detailed) {
            $day['reliability'] = [
                'level' => $balance === null ? 'unavailable' : ($complete && $items->where('quality', 'low')->isEmpty() && $withKcal->where('nutrition_status', 'estimated')->isEmpty() ? 'moderate' : 'low'),
                'notes' => [
                    "Toutes les valeurs sont des estimations issues de modèles, pas des mesures.",
                    "Calories des repas : valeurs « estimées » (ordre de grandeur) ou « vérifiées » seulement si vous les avez saisies ainsi.",
                    "Dépense de repos : formule Mifflin-St Jeor, précision individuelle limitée (souvent ± 10 % ou plus).",
                    "Activités : valeurs MET moyennes ; votre dépense réelle peut différer nettement.",
                    "Les mouvements quotidiens non enregistrés ne sont pas comptés : la dépense est plutôt sous-estimée.",
                    "Le poids varie aussi avec l'eau et le contenu digestif : un bilan positif ou négatif ne prouve ni gain ni perte de graisse.",
                ],
            ];
        }

        return $day;
    }
}
