<?php

namespace App\Http\Controllers\Api;

use App\Models\SymptomEntry;
use App\Services\SafetyService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SymptomEntryController extends OwnedCrudController
{
    protected string $modelClass = SymptomEntry::class;

    protected string $dateColumn = 'occurred_at';

    public const TYPES = 'breathlessness,swelling,fatigue,pain,dizziness,post_meal_discomfort,chest_pain,fainting,other';

    protected function rules(Request $request): array
    {
        return [
            'client_id' => 'nullable|string|max:64',
            'symptom_type' => 'required|in:'.self::TYPES,
            'custom_label' => 'nullable|string|max:120',
            'occurred_at' => 'required|date',
            'intensity' => 'required|integer|between:0,10',
            'duration_minutes' => 'nullable|integer|min:0|max:10080',
            'at_rest' => 'nullable|boolean',
            'context' => 'nullable|string|max:255',
            'activity' => 'nullable|string|max:255',
            'associated_symptoms' => 'nullable|array|max:10',
            'associated_symptoms.*' => 'string|max:60',
            'trend' => 'nullable|in:better,same,worse',
            'notes' => 'nullable|string|max:2000',
        ];
    }

    /** Safety status is returned with every write so a warning is never delayed. */
    public function store(Request $request): JsonResponse
    {
        $response = parent::store($request);

        return $this->withSafety($request, $response);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        return $this->withSafety($request, parent::update($request, $id));
    }

    private function withSafety(Request $request, JsonResponse $response): JsonResponse
    {
        $data = $response->getData(true);
        $data['safety'] = app(SafetyService::class)->evaluate($request->user()->fresh());
        $response->setData($data);

        return $response;
    }
}
