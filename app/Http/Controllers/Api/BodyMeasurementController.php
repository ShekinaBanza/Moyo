<?php

namespace App\Http\Controllers\Api;

use App\Models\BodyMeasurement;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class BodyMeasurementController extends OwnedCrudController
{
    protected string $modelClass = BodyMeasurement::class;

    protected string $dateColumn = 'measured_at';

    protected function rules(Request $request): array
    {
        return [
            'client_id' => 'nullable|string|max:64',
            'kind' => 'required|in:weight,waist,hip,chest,arm,thigh',
            'value' => 'required|numeric|min:1|max:500',
            'measured_at' => 'required|date',
            'notes' => 'nullable|string|max:2000',
        ];
    }

    protected function prepare(array $data, ?Model $existing): array
    {
        $kind = $data['kind'] ?? $existing?->kind;
        $value = (float) ($data['value'] ?? $existing?->value);
        $data['unit'] = $kind === 'weight' ? 'kg' : 'cm';
        if ($kind === 'weight' && ($value < 2 || $value > 500)) {
            throw ValidationException::withMessages(['value' => ['Le poids doit être entre 2 et 500 kg.']]);
        }
        if ($kind !== 'weight' && ($value < 5 || $value > 300)) {
            throw ValidationException::withMessages(['value' => ['La mesure doit être entre 5 et 300 cm.']]);
        }

        return $data;
    }
}
