<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Reminder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Reminders are user preferences. They are only displayed by the app while it is open;
 * no push delivery exists yet, and they are never presented as medical alerts.
 */
class ReminderController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        return response()->json(['data' => Reminder::where('user_id', $request->user()->id)->get()]);
    }

    public function upsert(Request $request, string $kind): JsonResponse
    {
        abort_unless(in_array($kind, ['meals', 'sleep', 'symptoms', 'measurement', 'habits'], true), 404);
        $data = $request->validate(['time_of_day' => 'required|date_format:H:i', 'enabled' => 'required|boolean']);
        $reminder = $request->user()->reminders()->firstOrNew(['kind' => $kind]);
        $reminder->fill($data)->save();

        return response()->json(['data' => $reminder]);
    }
}
