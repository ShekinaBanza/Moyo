<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityEntry;
use App\Models\BodyMeasurement;
use App\Models\FoodCatalogItem;
use App\Models\FoodEntry;
use App\Models\HabitRecord;
use App\Models\HealthMeasurement;
use App\Models\SleepRecord;
use App\Models\SymptomEntry;
use App\Models\WearableDevice;
use App\Services\SafetyService;
use App\Services\TrendService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

/** Read-only aggregates: dashboard, trends, safety status, food catalog. Values missing stay null ("Non disponible"). */
class InsightsController extends Controller
{
    public function dashboard(Request $request, SafetyService $safety): JsonResponse
    {
        $user = $request->user();
        $uid = $user->id;
        $today = now()->startOfDay();

        $sleep = SleepRecord::where('user_id', $uid)->orderByDesc('night_date')->orderByDesc('id')->first();
        $todayActivity = ActivityEntry::where('user_id', $uid)->whereBetween('started_at', [$today, $today->copy()->endOfDay()])->get();
        $device = WearableDevice::where('user_id', $uid)->latest()->first();
        $lastMeasurement = HealthMeasurement::where('user_id', $uid)->orderByDesc('measured_at')->first();

        $latestBody = fn (string $kind) => BodyMeasurement::where('user_id', $uid)->where('kind', $kind)->orderByDesc('measured_at')->first(['value', 'unit', 'measured_at', 'source_type']);

        return response()->json(['data' => [
            'safety' => $safety->evaluate($user),
            'sleep' => $sleep,
            'activity_today' => [
                'entries' => $todayActivity->count(),
                'steps' => $todayActivity->whereNotNull('steps')->count() ? (int) $todayActivity->sum('steps') : null,
                'duration_minutes' => $todayActivity->whereNotNull('duration_minutes')->count() ? (int) $todayActivity->sum('duration_minutes') : null,
                'sources' => $todayActivity->pluck('source_type')->unique()->values(),
            ],
            'recent_meals' => FoodEntry::where('user_id', $uid)->orderByDesc('eaten_at')->limit(3)->get(),
            'weight' => $latestBody('weight'),
            'waist' => $latestBody('waist'),
            'recent_symptoms' => SymptomEntry::where('user_id', $uid)->where('occurred_at', '>=', now()->subDays(7))->orderByDesc('occurred_at')->limit(5)->get(),
            'habits_today' => HabitRecord::where('user_id', $uid)->whereDate('day', $today->toDateString())->get(),
            'goals' => [
                'sleep_goal_hours' => $user->healthProfile?->sleep_goal_hours,
                'steps_goal' => $user->healthProfile?->steps_goal,
            ],
            'device' => $device ? [
                'id' => $device->id, 'name' => $device->name,
                'connection_status' => $device->connection_status,
                'integration_status' => $device->integration_status,
                'last_sync_at' => $device->last_sync_at,
            ] : null,
            'last_measurement' => $lastMeasurement ? [
                'type' => $lastMeasurement->measurement_type, 'value' => $lastMeasurement->value_numeric, 'unit' => $lastMeasurement->unit,
                'source_type' => $lastMeasurement->source_type, 'measured_at' => $lastMeasurement->measured_at,
                'quality_status' => $lastMeasurement->quality_status,
            ] : null,
        ]]);
    }

    public function trends(Request $request, TrendService $trends): JsonResponse
    {
        $data = $request->validate([
            'range' => 'nullable|in:day,week,month,custom',
            'from' => 'required_if:range,custom|nullable|date',
            'to' => 'required_if:range,custom|nullable|date|after_or_equal:from',
        ]);
        $to = Carbon::parse($data['to'] ?? now())->startOfDay();
        $from = match ($data['range'] ?? 'week') {
            'day' => $to->copy(),
            'month' => $to->copy()->subDays(29),
            'custom' => Carbon::parse($data['from'])->startOfDay(),
            default => $to->copy()->subDays(6),
        };
        abort_if($from->diffInDays($to) > 366, 422, 'Période trop longue (366 jours maximum).');

        return response()->json(['data' => $trends->series($request->user(), $from, $to)]);
    }

    public function safetyStatus(Request $request, SafetyService $safety): JsonResponse
    {
        return response()->json(['data' => $safety->evaluate($request->user())]);
    }

    public function foodCatalog(): JsonResponse
    {
        return response()->json(['data' => FoodCatalogItem::orderBy('id')->get()]);
    }
}
