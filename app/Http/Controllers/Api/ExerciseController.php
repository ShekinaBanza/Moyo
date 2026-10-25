<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Exercise;
use App\Services\WorkoutService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Shared, read-only catalogue + the access mode derived from the user's declared symptoms. */
class ExerciseController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $data = $request->validate([
            'category' => 'nullable|in:musculation,abdominaux,mobilite,general',
            'muscle_group' => 'nullable|string|max:30',
            'level' => 'nullable|in:beginner,intermediate,advanced',
            'q' => 'nullable|string|max:60',
        ]);
        $q = Exercise::query()->orderBy('sort');
        foreach (['category', 'muscle_group', 'level'] as $f) {
            if (! empty($data[$f])) {
                $q->where($f, $data[$f]);
            }
        }
        if (! empty($data['q'])) {
            $q->where('name', 'like', '%'.str_replace(['%', '_'], ['\%', '\_'], $data['q']).'%');
        }

        return response()->json(['data' => $q->get()]);
    }

    public function show(string $slug): JsonResponse
    {
        return response()->json(['data' => Exercise::where('slug', $slug)->firstOrFail()]);
    }

    public function access(Request $request, WorkoutService $workouts): JsonResponse
    {
        return response()->json(['data' => $workouts->access($request->user())]);
    }
}
