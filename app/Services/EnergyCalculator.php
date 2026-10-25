<?php

namespace App\Services;

/**
 * Pure energy formulas. No database, no clock: easy to test.
 *
 * Gross activity energy (MET model):  kcal = MET x 3.5 x kg / 200 x minutes
 * Net activity energy (above rest):   kcal = (MET - 1) x 3.5 x kg / 200 x minutes
 *   (1 MET = resting expenditure, so subtracting 1 MET removes the resting cost of the same duration.)
 * Resting metabolic rate: Mifflin-St Jeor (1990).
 *
 * Gross and net values are NEVER summed together. The daily total is
 *   resting metabolic rate (24 h) + NET activity energy
 * which avoids counting the resting cost twice.
 */
class EnergyCalculator
{
    public const GENERIC_MET = ['light' => 2.5, 'moderate' => 4.0, 'vigorous' => 7.0];

    public static function grossKcal(float $met, float $kg, float $minutes): float
    {
        return $met * 3.5 * $kg / 200 * $minutes;
    }

    public static function netKcal(float $met, float $kg, float $minutes): float
    {
        return max(0.0, ($met - 1) * 3.5 * $kg / 200 * $minutes);
    }

    /** Effort scale 1-10 -> generic intensity class (used only for custom activities). */
    public static function intensityFromEffort(?int $effort): ?string
    {
        if ($effort === null) {
            return null;
        }

        return $effort <= 3 ? 'light' : ($effort <= 6 ? 'moderate' : 'vigorous');
    }

    /**
     * Mifflin-St Jeor. Needs a binary sex constant, so 'other'/unknown returns null (no invented value).
     *
     * @return float|null kcal/day, or null when a required variable is missing
     */
    public static function restingKcal(?string $sex, ?int $ageYears, ?float $heightCm, ?float $weightKg): ?float
    {
        if (! in_array($sex, ['male', 'female'], true) || $ageYears === null || $heightCm === null || $weightKg === null) {
            return null;
        }
        if ($ageYears < 15 || $ageYears > 100) {
            return null; // formula not intended for children; outside validated range
        }

        return 10 * $weightKg + 6.25 * $heightCm - 5 * $ageYears + ($sex === 'male' ? 5 : -161);
    }

    /**
     * @param  float|null  $met  MET of the catalogue entry (null for custom entries)
     * @return array{gross_kcal:?float,net_kcal:?float,met:?float,quality:string,assumptions:string[],missing:string[]}
     */
    public static function activityEstimate(?float $met, bool $isCustom, ?float $weightKg, ?int $minutes, ?int $effort): array
    {
        $missing = [];
        $assumptions = [];
        $quality = 'good';

        if ($minutes === null || $minutes <= 0) {
            $missing[] = 'durée';
        }
        if ($weightKg === null) {
            $missing[] = 'poids';
        }
        if ($isCustom || $met === null) {
            $class = self::intensityFromEffort($effort);
            if ($class === null) {
                $missing[] = 'intensité (effort perçu)';
            } else {
                $met = self::GENERIC_MET[$class];
                $quality = 'low';
                $assumptions[] = "MET générique ({$met}) déduit de l'effort perçu : estimation grossière.";
            }
        }
        if ($missing) {
            return ['gross_kcal' => null, 'net_kcal' => null, 'met' => $met, 'quality' => 'unavailable', 'assumptions' => $assumptions, 'missing' => $missing];
        }

        return [
            'gross_kcal' => round(self::grossKcal($met, $weightKg, $minutes), 1),
            'net_kcal' => round(self::netKcal($met, $weightKg, $minutes), 1),
            'met' => $met,
            'quality' => $quality,
            'assumptions' => $assumptions,
            'missing' => [],
        ];
    }

    /** @return 'surplus'|'deficit'|'close' */
    public static function balanceStatus(float $balance, float $tolerance = 100): string
    {
        return abs($balance) <= $tolerance ? 'close' : ($balance > 0 ? 'surplus' : 'deficit');
    }
}
