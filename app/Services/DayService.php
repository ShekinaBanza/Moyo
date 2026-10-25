<?php

namespace App\Services;

use App\Models\ActivityEntry;
use App\Models\BodyMeasurement;
use App\Models\FoodEntry;
use App\Models\GpsTrack;
use App\Models\SleepRecord;
use App\Models\SymptomEntry;
use App\Models\User;
use App\Models\UserNotification;
use Illuminate\Support\Carbon;

/** Chronological view of one day, mixing manual entries and GPS/device data without merging them. */
class DayService
{
    public function __construct(private EnergyService $energy, private NotificationScheduler $scheduler) {}

    public function build(User $user, string $date): array
    {
        $tz = $this->energy->timezone($user);
        $start = Carbon::parse($date, $tz)->startOfDay()->utc();
        $end = Carbon::parse($date, $tz)->endOfDay()->utc();
        $local = fn ($t) => $t ? $t->copy()->setTimezone($tz)->toIso8601String() : null;
        $items = [];

        $sleep = SleepRecord::where('user_id', $user->id)->whereDate('night_date', $date)->orderByDesc('id')->first();
        if ($sleep) {
            $items[] = ['type' => 'wake', 'at' => $local($sleep->wake_time), 'title' => 'Réveil', 'detail' => null, 'source' => $sleep->source_type, 'detected' => $sleep->source_type !== 'manual', 'id' => $sleep->id, 'link' => '/app/sleep'];
            $items[] = ['type' => 'sleep', 'at' => $local($sleep->bedtime), 'title' => 'Sommeil', 'detail' => ['sleep_minutes' => $sleep->sleep_minutes, 'time_in_bed_minutes' => $sleep->time_in_bed_minutes], 'source' => $sleep->source_type, 'detected' => $sleep->source_type !== 'manual', 'id' => $sleep->id, 'link' => '/app/sleep'];
        }
        $meals = FoodEntry::where('user_id', $user->id)->whereBetween('eaten_at', [$start, $end])->get();
        foreach ($meals as $f) {
            $items[] = ['type' => 'meal', 'at' => $local($f->eaten_at), 'title' => $f->name, 'detail' => ['meal_type' => $f->meal_type, 'kcal' => $f->kcal, 'nutrition_status' => $f->nutrition_status], 'source' => 'manual', 'detected' => false, 'id' => $f->id, 'link' => '/app/food'];
        }
        $acts = ActivityEntry::where('user_id', $user->id)->whereBetween('started_at', [$start, $end])->get();
        $est = $this->energy->estimateEntries($user, $acts);
        $catalogNames = \App\Models\ActivityCatalogItem::pluck('name', 'id');
        foreach ($acts as $a) {
            $items[] = ['type' => 'activity', 'at' => $local($a->started_at), 'title' => $a->custom_label ?: ($catalogNames[$a->catalog_id] ?? $a->activity_type),
                'detail' => ['minutes' => $a->duration_minutes, 'distance_km' => $a->distance_km, 'distance_source' => $a->distance_source, 'net_kcal' => $est[$a->id]['net_kcal'] ?? null, 'track_id' => $a->track_id],
                'source' => $a->source_type, 'detected' => in_array($a->source_type, ['gps', 'watch'], true), 'id' => $a->id, 'link' => '/app/activity'];
        }
        $linked = $acts->pluck('track_id')->filter()->all();
        $tracks = GpsTrack::where('user_id', $user->id)->whereBetween('started_at', [$start, $end])->get();
        foreach ($tracks as $t) {
            $items[] = ['type' => 'track', 'at' => $local($t->started_at), 'title' => 'Déplacement enregistré par GPS',
                'detail' => ['distance_m' => $t->distance_m, 'duration_seconds' => $t->duration_seconds, 'status' => $t->status, 'linked_to_activity' => in_array($t->id, $linked, true), 'note' => "Un déplacement n'est pas une marche : associez-le à une activité pour le préciser."],
                'source' => 'gps', 'detected' => true, 'id' => $t->id, 'link' => '/app/map/history'];
        }
        foreach (BodyMeasurement::where('user_id', $user->id)->whereBetween('measured_at', [$start, $end])->get() as $m) {
            $items[] = ['type' => 'measurement', 'at' => $local($m->measured_at), 'title' => ucfirst($m->kind === 'weight' ? 'poids' : "mesure ({$m->kind})"), 'detail' => ['value' => $m->value, 'unit' => $m->unit], 'source' => $m->source_type, 'detected' => $m->source_type !== 'manual', 'id' => $m->id, 'link' => '/app/body'];
        }
        foreach (SymptomEntry::where('user_id', $user->id)->whereBetween('occurred_at', [$start, $end])->get() as $s) {
            $items[] = ['type' => 'symptom', 'at' => $local($s->occurred_at), 'title' => 'Symptôme noté', 'detail' => ['symptom_type' => $s->symptom_type, 'intensity' => $s->intensity], 'source' => 'manual', 'detected' => false, 'id' => $s->id, 'link' => '/app/symptoms'];
        }
        foreach (UserNotification::where('user_id', $user->id)->whereBetween('created_at', [$start, $end])->get() as $n) {
            $done = $this->scheduler->isDone($user, $n->kind, $date, $tz);
            $items[] = ['type' => 'reminder', 'at' => $local($n->created_at), 'title' => $n->title, 'detail' => ['status' => $done ? 'done' : 'pending'], 'source' => 'app', 'detected' => false, 'id' => $n->id, 'link' => $n->link];
        }
        usort($items, fn ($a, $b) => strcmp((string) $a['at'], (string) $b['at']));

        $energy = $this->energy->daily($user, $date);
        $declaredKm = round((float) $acts->whereNotNull('distance_km')->sum('distance_km'), 2);
        $unassignedGpsKm = round($tracks->reject(fn ($t) => in_array($t->id, $linked, true))->sum('distance_m') / 1000, 2);
        $missing = [];
        if (! $sleep) {
            $missing[] = 'sommeil de la nuit';
        }
        if ($meals->isEmpty()) {
            $missing[] = 'repas';
        }
        if ($acts->isEmpty()) {
            $missing[] = 'activités';
        }
        foreach ($energy['consumed']['missing'] as $f) {
            $missing[] = "calories de « {$f['name']} »";
        }
        foreach ($energy['expenditure']['resting']['missing'] as $x) {
            $missing[] = $x;
        }

        return [
            'date' => $date,
            'timezone' => $tz,
            'timeline' => $items,
            'recap' => [
                'foods' => $meals->map(fn ($f) => ['name' => $f->name, 'meal_type' => $f->meal_type])->values(),
                'activities' => $acts->count(),
                'activity_minutes' => $acts->whereNotNull('duration_minutes')->count() ? (int) $acts->sum('duration_minutes') : null,
                'distance_declared_km' => $acts->whereNotNull('distance_km')->count() ? $declaredKm : null,
                'distance_gps_unassigned_km' => $tracks->isNotEmpty() ? $unassignedGpsKm : null,
                'consumed_kcal' => $energy['consumed']['total_kcal'],
                'expenditure_kcal' => $energy['expenditure']['total_kcal'],
                'balance_kcal' => $energy['balance']['kcal'],
                'balance_status' => $energy['balance']['status'],
                'balance_caveats' => $energy['balance']['caveats'],
                'missing' => array_values(array_unique($missing)),
            ],
        ];
    }
}
