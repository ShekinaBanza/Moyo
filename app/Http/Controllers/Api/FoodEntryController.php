<?php

namespace App\Http\Controllers\Api;

use App\Models\FoodEntry;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;

class FoodEntryController extends OwnedCrudController
{
    protected string $modelClass = FoodEntry::class;

    protected string $dateColumn = 'eaten_at';

    protected function rules(Request $request): array
    {
        return [
            'client_id' => 'nullable|string|max:64',
            'catalog_id' => 'nullable|integer|exists:food_catalog,id',
            'name' => 'required|string|max:160',
            'meal_type' => 'required|in:breakfast,lunch,dinner,snack,drink',
            'eaten_at' => 'required|date',
            'quantity' => 'nullable|numeric|min:0|max:100000',
            'unit' => 'nullable|in:small,medium,large,g,ml,piece,spoon,cup',
            'ingredients' => 'nullable|array|max:30',
            'ingredients.*' => 'string|max:80',
            'feeling_after' => 'nullable|in:good,neutral,heavy,bloated,nauseous,tired,other',
            'symptoms_after' => 'nullable|array|max:10',
            'symptoms_after.*' => 'string|max:60',
            'kcal' => 'nullable|numeric|min:0|max:10000',
            'nutrition_status' => 'nullable|in:verified,estimated,unknown',
            'nutrition_source' => 'nullable|string|max:190',
            'notes' => 'nullable|string|max:2000',
        ];
    }

    protected function prepare(array $data, ?Model $existing): array
    {
        $status = $data['nutrition_status'] ?? $existing?->nutrition_status ?? 'unknown';
        $data['nutrition_status'] = $status;
        // No precise calories unless the composition makes the value verified or estimated.
        if ($status === 'unknown') {
            $data['kcal'] = null;
        }

        return $data;
    }
}
