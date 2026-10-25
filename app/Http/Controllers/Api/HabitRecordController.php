<?php

namespace App\Http\Controllers\Api;

use App\Models\HabitRecord;
use Illuminate\Http\Request;

class HabitRecordController extends OwnedCrudController
{
    protected string $modelClass = HabitRecord::class;

    protected string $dateColumn = 'day';

    protected function rules(Request $request): array
    {
        return [
            'client_id' => 'nullable|string|max:64',
            'habit' => 'required|in:water,no_soda,walk,vegetables,sleep_routine,custom',
            'custom_label' => 'nullable|string|max:120',
            'day' => 'required|date',
            'done' => 'required|boolean',
            'notes' => 'nullable|string|max:1000',
        ];
    }
}
