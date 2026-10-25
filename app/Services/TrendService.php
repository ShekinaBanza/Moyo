<?php

namespace App\Services;

use App\Models\ActivityEntry;
use App\Models\BodyMeasurement;
use App\Models\FoodEntry;
use App\Models\SleepRecord;
use App\Models\SymptomEntry;
use App\Models\User;
use Illuminate\Support\Carbon;

/**
 * Purely descriptive series computed from the user's own records.
 * No composite score, no causal claim, no interpretation.
 */
class TrendService
{
    public function series(User $user, Carbon $from, Carbon $to): array
    {
        $uid = $user->id;
        $toEnd = $to->copy()->endOfDay();

        $sleep = SleepRecord::where('user_id', $uid)->whereBetween('night_date', [$from->toDateString(), $to->toDateString()])
            ->orderBy('night_date')->get(['night_date', 'sleep_minutes', 'time_in_bed_minutes', 'bedtime', 'wake_time', 'quality']);

        $body = fn (string $kind) => BodyMeasurement::where('user_id', $uid)->where('kind', $kind)
            ->whereBetween('measured_at', [$from->copy()->startOfDay(), $toEnd])->orderBy('measured_at')
            ->get(['measured_at', 'value', 'unit'])->map(fn ($m) => ['at' => $m->measured_at->toIso8601String(), 'value' => $m->value, 'unit' => $m->unit])->values();

        $steps = ActivityEntry::where('user_id', $uid)->whereBetween('started_at', [$from->copy()->startOfDay(), $toEnd])
            ->get(['started_at', 'steps', 'duration_minutes', 'source_type'])
            ->groupBy(fn ($a) => $a->started_at->toDateString())
            ->map(fn ($g, $d) => [
                'day' => $d,
                'steps' => $g->whereNotNull('steps')->count() ? (int) $g->sum('steps') : null,
                'duration_minutes' => $g->whereNotNull('duration_minutes')->count() ? (int) $g->sum('duration_minutes') : null,
            ])->sortKeys()->values();

        $symptoms = SymptomEntry::where('user_id', $uid)->whereBetween('occurred_at', [$from->copy()->startOfDay(), $toEnd])
            ->orderBy('occurred_at')->get(['occurred_at', 'symptom_type', 'intensity'])
            ->map(fn ($s) => ['at' => $s->occurred_at->toIso8601String(), 'type' => $s->symptom_type, 'intensity' => $s->intensity])->values();

        $meals = FoodEntry::where('user_id', $uid)->whereBetween('eaten_at', [$from->copy()->startOfDay(), $toEnd])
            ->get(['eaten_at'])->groupBy(fn ($f) => $f->eaten_at->toDateString())
            ->map(fn ($g, $d) => ['day' => $d, 'count' => $g->count()])->sortKeys()->values();

        return [
            'period' => ['from' => $from->toDateString(), 'to' => $to->toDateString()],
            'sleep' => $sleep->map(fn ($s) => [
                'night' => $s->night_date->toDateString(),
                'sleep_minutes' => $s->sleep_minutes,
                'time_in_bed_minutes' => $s->time_in_bed_minutes,
                'bed_minute_of_day' => $this->minuteOfDay($s->bedtime),
                'wake_minute_of_day' => $this->minuteOfDay($s->wake_time),
                'quality' => $s->quality,
            ])->values(),
            'sleep_regularity' => $this->regularity($sleep),
            'weight' => $body('weight'),
            'waist' => $body('waist'),
            'activity' => $steps,
            'symptoms' => $symptoms,
            'meals' => $meals,
            'comparison' => $this->compare($user, $from, $to),
        ];
    }

    private function minuteOfDay(Carbon $t): int
    {
        return $t->hour * 60 + $t->minute;
    }

    /** Standard deviation of bedtime (minutes), circular-safe by shifting after-midnight times by 24h. */
    private function regularity($sleep): ?array
    {
        if ($sleep->count() < 3) {
            return null;
        }
        $beds = $sleep->map(fn ($s) => ($m = $this->minuteOfDay($s->bedtime)) < 12 * 60 ? $m + 1440 : $m);
        $mean = $beds->avg();
        $sd = sqrt($beds->map(fn ($v) => ($v - $mean) ** 2)->avg());

        return ['bedtime_sd_minutes' => (int) round($sd), 'nights' => $sleep->count()];
    }

    /** Average sleep and logged-day counts for this period vs the previous period of equal length. */
    private function compare(User $user, Carbon $from, Carbon $to): array
    {
        $days = $from->diffInDays($to) + 1;
        $prevTo = $from->copy()->subDay();
        $prevFrom = $prevTo->copy()->subDays($days - 1);
        $avg = fn (Carbon $a, Carbon $b) => SleepRecord::where('user_id', $user->id)
            ->whereBetween('night_date', [$a->toDateString(), $b->toDateString()])->avg('sleep_minutes');

        $cur = $avg($from, $to);
        $prev = $avg($prevFrom, $prevTo);

        return [
            'sleep_avg_minutes' => ['current' => $cur !== null ? (int) round($cur) : null, 'previous' => $prev !== null ? (int) round($prev) : null],
            'previous_period' => ['from' => $prevFrom->toDateString(), 'to' => $prevTo->toDateString()],
        ];
    }
}
