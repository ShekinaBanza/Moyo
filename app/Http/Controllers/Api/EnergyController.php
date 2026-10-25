<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityCatalogItem;
use App\Services\DayService;
use App\Services\EnergyService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class EnergyController extends Controller
{
    public function daily(Request $request, EnergyService $energy): JsonResponse
    {
        $data = $request->validate(['date' => 'nullable|date_format:Y-m-d']);
        $date = $data['date'] ?? Carbon::now($energy->timezone($request->user()))->toDateString();

        return response()->json(['data' => $energy->daily($request->user(), $date)]);
    }

    public function history(Request $request, EnergyService $energy): JsonResponse
    {
        $data = $request->validate([
            'range' => 'nullable|in:week,month,custom',
            'from' => 'required_if:range,custom|nullable|date_format:Y-m-d',
            'to' => 'nullable|date_format:Y-m-d|after_or_equal:from',
        ]);
        $tz = $energy->timezone($request->user());
        $to = Carbon::parse($data['to'] ?? now($tz)->toDateString(), $tz);
        $from = match ($data['range'] ?? 'week') {
            'month' => $to->copy()->subDays(29),
            'custom' => Carbon::parse($data['from'], $tz),
            default => $to->copy()->subDays(6),
        };
        abort_if($from->diffInDays($to) > 120, 422, 'Période trop longue (120 jours maximum).');

        $rows = $energy->history($request->user(), $from->toDateString(), $to->toDateString());
        $withBalance = array_filter($rows, fn ($r) => $r['balance_kcal'] !== null);

        return response()->json(['data' => [
            'period' => ['from' => $from->toDateString(), 'to' => $to->toDateString()],
            'days' => $rows,
            'summary' => [
                'days_with_balance' => count($withBalance),
                'avg_balance_kcal' => $withBalance ? (int) round(array_sum(array_column($withBalance, 'balance_kcal')) / count($withBalance)) : null,
                'note' => 'Moyenne calculée uniquement sur les jours où un bilan est calculable.',
            ],
        ]]);
    }

    public function activityCatalog(): JsonResponse
    {
        return response()->json(['data' => ActivityCatalogItem::orderBy('sort')->get()]);
    }

    public function day(Request $request, DayService $day, EnergyService $energy): JsonResponse
    {
        $data = $request->validate(['date' => 'nullable|date_format:Y-m-d']);
        $date = $data['date'] ?? Carbon::now($energy->timezone($request->user()))->toDateString();

        return response()->json(['data' => $day->build($request->user(), $date)]);
    }
}
