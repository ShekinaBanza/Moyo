<?php

namespace App\Services;

use Carbon\CarbonInterface;
use InvalidArgumentException;

/**
 * Time in bed and estimated sleep are two different values.
 * Works on full datetimes, so a night crossing midnight is handled naturally.
 */
class SleepDurationCalculator
{
    public const MAX_IN_BED_MINUTES = 24 * 60;

    /** @return array{time_in_bed_minutes:int, sleep_minutes:int} */
    public function calculate(CarbonInterface $bedtime, CarbonInterface $wake, ?CarbonInterface $onset = null, ?int $awakeMinutes = null): array
    {
        if ($wake->lessThanOrEqualTo($bedtime)) {
            throw new InvalidArgumentException('wake_before_bedtime');
        }
        $inBed = (int) $bedtime->diffInMinutes($wake, true);
        if ($inBed > self::MAX_IN_BED_MINUTES) {
            throw new InvalidArgumentException('too_long');
        }
        $start = $bedtime;
        if ($onset) {
            if ($onset->lessThan($bedtime) || $onset->greaterThanOrEqualTo($wake)) {
                throw new InvalidArgumentException('onset_out_of_range');
            }
            $start = $onset;
        }
        $asleepWindow = (int) $start->diffInMinutes($wake, true);
        $awake = max(0, $awakeMinutes ?? 0);
        if ($awake > $asleepWindow) {
            throw new InvalidArgumentException('awake_exceeds_sleep');
        }

        return ['time_in_bed_minutes' => $inBed, 'sleep_minutes' => $asleepWindow - $awake];
    }
}
