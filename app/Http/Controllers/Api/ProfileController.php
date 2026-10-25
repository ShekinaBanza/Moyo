<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\HealthProfile;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ProfileController extends Controller
{
    public function me(Request $request): JsonResponse
    {
        $user = $request->user();
        $profile = $user->healthProfile()->firstOrCreate([]);

        return response()->json(['data' => [
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'profile' => $profile,
        ]]);
    }

    public function update(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => 'sometimes|string|max:120',
            'birth_date' => 'nullable|date|before:today',
            'sex' => 'nullable|in:female,male,other',
            'height_cm' => 'nullable|numeric|between:50,250',
            'evaluated_by_professional' => 'nullable|boolean',
            'last_evaluation_date' => 'nullable|date|before_or_equal:today',
            'sleep_goal_hours' => 'nullable|numeric|between:4,12',
            'steps_goal' => 'nullable|integer|between:500,50000',
            'activity_level' => 'nullable|in:sedentary,light,moderate,active',
        ]);

        $user = $request->user();
        if (isset($data['name'])) {
            $user->update(['name' => $data['name']]);
            unset($data['name']);
        }
        $profile = $user->healthProfile()->firstOrCreate([]);
        $profile->fill($data)->save();

        return $this->me($request);
    }
}
