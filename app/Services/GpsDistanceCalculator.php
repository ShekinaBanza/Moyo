<?php

namespace App\Services;

/**
 * Distance from successive GPS points (haversine), never first-to-last.
 * Rules (documented in docs/GPS.md):
 *  - a point whose reported accuracy is worse than MAX_ACCURACY_M is rejected;
 *  - a point closer than MIN_STEP_M to the last accepted point is ignored (GPS jitter while standing still);
 *  - a point implying a speed above MAX_SPEED_MS from the last accepted point is rejected (teleport glitch);
 *  - nothing is counted across segments (pause/resume) nor across a signal gap longer than GAP_SECONDS.
 */
class GpsDistanceCalculator
{
    public const EARTH_RADIUS_M = 6371008.8;

    public const MAX_ACCURACY_M = 50.0;

    public const MIN_STEP_M = 3.0;

    public const MAX_SPEED_MS = 15.0;

    public const GAP_SECONDS = 300;

    public static function haversine(float $lat1, float $lng1, float $lat2, float $lng2): float
    {
        $p1 = deg2rad($lat1);
        $p2 = deg2rad($lat2);
        $dp = $p2 - $p1;
        $dl = deg2rad($lng2 - $lng1);
        $a = sin($dp / 2) ** 2 + cos($p1) * cos($p2) * sin($dl / 2) ** 2;

        return 2 * self::EARTH_RADIUS_M * asin(min(1, sqrt($a)));
    }

    /**
     * @param  array<int,array{lat:float,lng:float,accuracy:?float,time:int,segment:int}>  $points  sorted by time
     * @return array{distance_m:float,duration_s:int,accepted:int,rejected:array{accuracy:int,speed:int},gaps:int,avg_accuracy_m:?float,avg_pace_s_per_km:?int}
     */
    public static function compute(array $points): array
    {
        $distance = 0.0;
        $accepted = 0;
        $rej = ['accuracy' => 0, 'speed' => 0];
        $gaps = 0;
        $accSum = 0.0;
        $accN = 0;
        $duration = 0; // active time: sums only the intervals actually covered by accepted points
        $last = null;

        foreach ($points as $p) {
            if ($p['accuracy'] !== null && $p['accuracy'] > self::MAX_ACCURACY_M) {
                $rej['accuracy']++;

                continue;
            }
            if ($last !== null && $last['segment'] === $p['segment']) {
                $dt = $p['time'] - $last['time'];
                if ($dt > self::GAP_SECONDS) {
                    $gaps++; // signal lost: restart from this point without counting the gap
                    $last = null;
                } else {
                    $d = self::haversine($last['lat'], $last['lng'], $p['lat'], $p['lng']);
                    if ($d < self::MIN_STEP_M) {
                        continue;
                    }
                    if ($dt > 0 && $d / $dt > self::MAX_SPEED_MS) {
                        $rej['speed']++;

                        continue;
                    }
                    $distance += $d;
                    $duration += $dt;
                }
            }
            $accepted++;
            if ($p['accuracy'] !== null) {
                $accSum += $p['accuracy'];
                $accN++;
            }
            $last = $p;
        }

        // Average pace only when distance and time are large enough to be meaningful.
        $pace = ($distance >= 100 && $duration >= 60) ? (int) round($duration / ($distance / 1000)) : null;

        return [
            'distance_m' => round($distance, 1),
            'duration_s' => $duration,
            'accepted' => $accepted,
            'rejected' => $rej,
            'gaps' => $gaps,
            'avg_accuracy_m' => $accN ? round($accSum / $accN, 1) : null,
            'avg_pace_s_per_km' => $pace,
        ];
    }
}
