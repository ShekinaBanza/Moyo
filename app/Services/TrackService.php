<?php

namespace App\Services;

use App\Models\GpsTrack;
use Illuminate\Support\Carbon;

/** Lifecycle and statistics of GPS tracks. Distance always comes from the stored points. */
class TrackService
{
    public const MAX_POINTS = 20000;

    /** A recording track with no point for this long is closed as "interrupted" (page closed, phone off...). */
    public const STALE_RECORDING_MIN = 30;

    public const STALE_PAUSED_HOURS = 12;

    /**
     * @param  array<int,array{lat:float,lng:float,accuracy?:?float,captured_at:string,segment?:int}>  $points
     * @return array{accepted:int,duplicates:int,rejected:int}
     */
    public function addPoints(GpsTrack $track, array $points): array
    {
        $now = now();
        $existing = $track->points()->count();
        $rows = [];
        $rejected = 0;
        $limit = $track->ended_at ? $track->ended_at->copy()->addSeconds(10) : $now->copy()->addMinutes(2);

        foreach ($points as $p) {
            $at = Carbon::parse($p['captured_at'])->utc();
            if ($at->lessThan($track->started_at->copy()->subMinute()) || $at->greaterThan($limit) || $existing + count($rows) >= self::MAX_POINTS) {
                $rejected++;

                continue;
            }
            $key = $at->copy()->setTimezone(config('app.timezone'))->format('Y-m-d H:i:s');
            $rows[$key] = [
                'track_id' => $track->id,
                'segment' => min((int) ($p['segment'] ?? $track->current_segment), $track->current_segment),
                'lat' => round((float) $p['lat'], 5),
                'lng' => round((float) $p['lng'], 5),
                'accuracy_m' => isset($p['accuracy']) ? round((float) $p['accuracy'], 1) : null,
                'captured_at' => $key,
            ];
        }

        $before = $track->points()->count();
        if ($rows) {
            $track->points()->insertOrIgnore(array_values($rows)); // (track_id, captured_at) unique: re-sends are harmless
        }
        $inserted = $track->points()->count() - $before;
        $this->recompute($track);

        return ['accepted' => $inserted, 'duplicates' => count($rows) - $inserted, 'rejected' => $rejected];
    }

    public function recompute(GpsTrack $track): GpsTrack
    {
        $points = $track->points()->orderBy('captured_at')->get(['lat', 'lng', 'accuracy_m', 'captured_at', 'segment'])
            ->map(fn ($p) => ['lat' => $p->lat, 'lng' => $p->lng, 'accuracy' => $p->accuracy_m, 'time' => $p->captured_at->getTimestamp(), 'segment' => (int) $p->segment])->all();
        usort($points, fn ($a, $b) => [$a['segment'], $a['time']] <=> [$b['segment'], $b['time']]);

        $r = GpsDistanceCalculator::compute($points);
        $track->forceFill([
            'distance_m' => (int) round($r['distance_m']),
            'duration_seconds' => $r['duration_s'],
            'points_count' => count($points),
            'rejected_points' => $r['rejected']['accuracy'] + $r['rejected']['speed'],
            'gap_count' => $r['gaps'],
            'avg_accuracy_m' => $r['avg_accuracy_m'],
        ])->save();

        return $track;
    }

    public function pause(GpsTrack $track): GpsTrack
    {
        abort_unless($track->status === 'recording', 409, "Ce trajet n'est pas en cours d'enregistrement.");
        $track->update(['status' => 'paused']);

        return $track;
    }

    public function resume(GpsTrack $track): GpsTrack
    {
        abort_unless($track->status === 'paused', 409, "Ce trajet n'est pas en pause.");
        $track->update(['status' => 'recording', 'current_segment' => $track->current_segment + 1]);

        return $track;
    }

    /** @param string $reason user|permission_lost|signal_lost|stale */
    public function finish(GpsTrack $track, bool $interrupted = false, string $reason = 'user'): GpsTrack
    {
        abort_unless(in_array($track->status, ['recording', 'paused'], true), 409, 'Ce trajet est déjà terminé.');
        $this->recompute($track);
        $last = $track->points()->max('captured_at');
        $track->update([
            'status' => $interrupted ? 'interrupted' : 'finished',
            'ended_at' => now(),
            'end_reason' => $interrupted ? $reason : 'user',
        ]);
        if ($last && $interrupted && $reason === 'stale') {
            $track->update(['ended_at' => Carbon::parse($last, config('app.timezone'))]);
        }

        return $track;
    }

    /** Lazily closes tracks that were left open (browser closed, phone switched off...). */
    public function closeStale(int $userId): int
    {
        $n = 0;
        GpsTrack::where('user_id', $userId)->whereIn('status', ['recording', 'paused'])->get()->each(function (GpsTrack $t) use (&$n) {
            $lastPoint = $t->points()->max('captured_at');
            $lastAt = $lastPoint ? Carbon::parse($lastPoint, config('app.timezone')) : $t->started_at;
            $stale = $t->status === 'recording'
                ? $lastAt->lessThan(now()->subMinutes(self::STALE_RECORDING_MIN))
                : $lastAt->lessThan(now()->subHours(self::STALE_PAUSED_HOURS));
            if ($stale) {
                $this->finish($t, true, 'stale');
                $n++;
            }
        });

        return $n;
    }
}
