<?php

namespace App\Services;

class MeasurementValidator
{
    /** type => [unit, min, max] */
    public const TYPES = [
        'heart_rate' => ['bpm', 20, 250],
        'spo2' => ['%', 50, 100],
        'steps' => ['count', 0, 200000],
        'skin_temperature' => ['°C', 20, 45],
        'hrv' => ['ms', 0, 500],
        'blood_pressure' => ['mmHg', 0, 0], // value_json only
    ];

    /** @return string|null error code, null when plausible */
    public function check(string $type, ?float $value, ?string $unit): ?string
    {
        if (! isset(self::TYPES[$type])) {
            return 'unknown_type';
        }
        [$u, $min, $max] = self::TYPES[$type];
        if ($unit !== $u) {
            return 'unit_mismatch';
        }
        if ($type === 'blood_pressure') {
            return null;
        }
        if ($value === null) {
            return 'value_required';
        }
        if ($value < $min || $value > $max) {
            return 'out_of_range';
        }

        return null;
    }
}
