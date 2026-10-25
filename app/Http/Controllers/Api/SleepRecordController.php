<?php

namespace App\Http\Controllers\Api;

use App\Models\SleepRecord;
use App\Services\SleepDurationCalculator;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Validation\ValidationException;
use InvalidArgumentException;

class SleepRecordController extends OwnedCrudController
{
    protected string $modelClass = SleepRecord::class;

    protected string $dateColumn = 'night_date';

    public function __construct(private SleepDurationCalculator $calculator) {}

    protected function rules(Request $request): array
    {
        return [
            'client_id' => 'nullable|string|max:64',
            'night_date' => 'required|date',
            'bedtime' => 'required|date',
            'sleep_onset_at' => 'nullable|date',
            'wake_time' => 'required|date',
            'night_awakenings' => 'nullable|integer|min:0|max:50',
            'awake_minutes' => 'nullable|integer|min:0|max:1440',
            'quality' => 'nullable|integer|between:1,5',
            'morning_energy' => 'nullable|integer|between:1,5',
            'notes' => 'nullable|string|max:2000',
            'source_type' => 'nullable|in:manual,watch,imported',
        ];
    }

    protected function prepare(array $data, ?Model $existing): array
    {
        $get = fn (string $k) => array_key_exists($k, $data) ? $data[$k] : $existing?->{$k};
        $bed = Carbon::parse($get('bedtime'));
        $wake = Carbon::parse($get('wake_time'));
        $onset = $get('sleep_onset_at') ? Carbon::parse($get('sleep_onset_at')) : null;

        try {
            $calc = $this->calculator->calculate($bed, $wake, $onset, $get('awake_minutes'));
        } catch (InvalidArgumentException $e) {
            $messages = [
                'wake_before_bedtime' => 'Le réveil doit être après le coucher.',
                'too_long' => 'La durée au lit ne peut pas dépasser 24 heures.',
                'onset_out_of_range' => "L'endormissement doit se situer entre le coucher et le réveil.",
                'awake_exceeds_sleep' => 'Le temps éveillé dépasse le temps de sommeil.',
            ];
            throw ValidationException::withMessages(['wake_time' => [$messages[$e->getMessage()] ?? 'Horaires incohérents.']]);
        }

        return $data + [] + $calc + ['source_type' => $data['source_type'] ?? $existing?->source_type ?? 'manual'];
    }
}
