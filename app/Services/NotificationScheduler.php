<?php

namespace App\Services;

use App\Models\ActivityEntry;
use App\Models\FoodEntry;
use App\Models\GpsTrack;
use App\Models\NotificationPreference;
use App\Models\SleepRecord;
use App\Models\User;
use App\Models\UserNotification;
use App\Models\WearableDevice;
use Illuminate\Support\Carbon;

/**
 * Creates in-app notifications from the user's preferences. Reminders only: never a diagnosis,
 * never a health value in the text, and never an emergency channel.
 *
 * It runs (a) lazily when the user opens the app (GET /notifications) and (b) from the scheduled
 * command `notifications:generate` when a cron is configured. Both are idempotent thanks to the
 * unique (user_id, dedupe_key) constraint.
 */
class NotificationScheduler
{
    /** A reminder is only created within this many minutes after its time: no stale pile-up. */
    public const WINDOW_MINUTES = 180;

    /** kind => [title, body, link, default time, default frequency, weekday, timed] */
    public const KINDS = [
        'breakfast' => ['Petit-déjeuner', 'Pensez à enregistrer votre petit-déjeuner.', '/app/food', '08:00', 'daily', null, true],
        'lunch' => ['Déjeuner', 'Pensez à enregistrer votre déjeuner.', '/app/food', '13:30', 'daily', null, true],
        'dinner' => ['Dîner', 'Pensez à enregistrer votre dîner.', '/app/food', '20:00', 'daily', null, true],
        'food_journal' => ['Journal alimentaire', 'Complétez votre journal alimentaire de la journée.', '/app/food', '21:00', 'daily', null, true],
        'sleep_journal' => ['Journal du sommeil', 'Notez votre nuit de sommeil.', '/app/sleep', '08:30', 'daily', null, true],
        'activities' => ['Activités du jour', 'Enregistrez vos activités de la journée.', '/app/day', '19:00', 'daily', null, true],
        'daily_summary' => ['Bilan quotidien', 'Votre récapitulatif de la journée est prêt à être consulté.', '/app/energy', '21:30', 'daily', null, true],
        'weekly_trends' => ['Tendances de la semaine', 'Consultez vos tendances de la semaine.', '/app/trends', '18:00', 'weekly', 0, true],
        'device_sync' => ['Synchronisation', "Votre appareil associé n'a pas été synchronisé récemment.", '/app/devices', '12:00', 'daily', null, true],
        'track_check' => ['Trajet en cours', 'Un trajet est toujours ouvert. Terminez-le ou vérifiez-le.', '/app/map', '12:00', 'daily', null, false],
        'unsynced_entries' => ['Saisies non synchronisées', 'Certaines saisies attendent encore une confirmation du serveur.', '/app', '12:00', 'daily', null, false],
    ];

    public const TEST_DEDUPE_PREFIX = 'test:';

    /** @return array<int,array<string,mixed>> preferences merged with defaults */
    public function preferencesFor(User $user): array
    {
        $saved = NotificationPreference::where('user_id', $user->id)->get()->keyBy('kind');

        return collect(self::KINDS)->map(function ($def, $kind) use ($saved) {
            $p = $saved->get($kind);

            return [
                'kind' => $kind,
                'label' => $def[0],
                'description' => $def[1],
                'timed' => $def[6],
                'enabled' => $p?->enabled ?? false,
                'time_of_day' => substr((string) ($p?->time_of_day ?? $def[3].':00'), 0, 5),
                'frequency' => $p?->frequency ?? $def[4],
                'weekday' => $p ? $p->weekday : $def[5],
            ];
        })->values()->all();
    }

    /** @return int number of notifications newly created */
    public function generateFor(User $user, ?Carbon $now = null): int
    {
        $profile = $user->healthProfile;
        if ($profile && $profile->notifications_enabled === false) {
            return 0;
        }
        $tz = $profile?->timezone ?: config('app.timezone');
        $local = ($now ?? now())->copy()->setTimezone($tz);
        $created = 0;

        foreach ($this->preferencesFor($user) as $pref) {
            if (! $pref['enabled']) {
                continue;
            }
            $kind = $pref['kind'];
            $def = self::KINDS[$kind];

            if (! $def[6]) {
                $created += $this->eventKind($user, $kind, $local) ? 1 : 0;

                continue;
            }
            if (! $this->frequencyMatches($pref, $local)) {
                continue;
            }
            [$h, $m] = array_map('intval', explode(':', $pref['time_of_day']));
            $due = $local->copy()->setTime($h, $m, 0);
            if ($local->lessThan($due) || $local->greaterThan($due->copy()->addMinutes(self::WINDOW_MINUTES))) {
                continue;
            }
            if ($this->isDone($user, $kind, $local->toDateString(), $tz)) {
                continue; // already logged: no useless reminder
            }
            if ($kind === 'device_sync' && ! $this->deviceNeedsSync($user)) {
                continue;
            }
            $created += $this->create($user, $kind, $kind.':'.$local->toDateString()) ? 1 : 0;
        }

        return $created;
    }

    public function create(User $user, string $kind, string $dedupeKey, ?string $title = null, ?string $body = null): ?UserNotification
    {
        $def = self::KINDS[$kind] ?? ['Rappel', '', '/app', '', '', null, false];
        $n = UserNotification::firstOrNew(['user_id' => $user->id, 'dedupe_key' => $dedupeKey]);
        if ($n->exists) {
            return null; // duplicate: nothing created
        }
        $n->fill(['kind' => $kind, 'title' => $title ?? $def[0], 'body' => $body ?? $def[1], 'link' => $def[2]]);
        $n->user_id = $user->id;
        $n->save();
        $n->push_status = app(WebPushSender::class)->send($user, $n);
        $n->save();

        return $n;
    }

    public function isDone(User $user, string $kind, string $date, string $tz): bool
    {
        $start = Carbon::parse($date, $tz)->startOfDay()->utc();
        $end = Carbon::parse($date, $tz)->endOfDay()->utc();
        $meal = fn (string $type) => FoodEntry::where('user_id', $user->id)->where('meal_type', $type)->whereBetween('eaten_at', [$start, $end])->exists();

        return match ($kind) {
            'breakfast' => $meal('breakfast'),
            'lunch' => $meal('lunch'),
            'dinner' => $meal('dinner'),
            'food_journal' => FoodEntry::where('user_id', $user->id)->whereBetween('eaten_at', [$start, $end])->count() >= 3,
            'sleep_journal' => SleepRecord::where('user_id', $user->id)->whereDate('night_date', $date)->exists(),
            'activities' => ActivityEntry::where('user_id', $user->id)->whereBetween('started_at', [$start, $end])->exists(),
            default => false, // summaries / trends / sync reminders are never "done" by logging
        };
    }

    private function frequencyMatches(array $pref, Carbon $local): bool
    {
        return match ($pref['frequency']) {
            'weekdays' => $local->isWeekday(),
            'weekly' => $pref['weekday'] === null || (int) $pref['weekday'] === $local->dayOfWeek,
            default => true,
        };
    }

    private function deviceNeedsSync(User $user): bool
    {
        $d = WearableDevice::where('user_id', $user->id)->orderByDesc('last_sync_at')->first();

        return $d !== null && ($d->last_sync_at === null || $d->last_sync_at->lessThan(now()->subDay()));
    }

    /** track_check: only when an open track has been silent for a while. */
    private function eventKind(User $user, string $kind, Carbon $local): bool
    {
        if ($kind !== 'track_check') {
            return false; // unsynced_entries is evaluated on the device (the outbox is local)
        }
        $made = false;
        GpsTrack::where('user_id', $user->id)->whereIn('status', ['recording', 'paused'])->get()->each(function (GpsTrack $t) use ($user, &$made) {
            $lastPoint = $t->points()->max('captured_at');
            $lastAt = $lastPoint ? Carbon::parse($lastPoint, config('app.timezone')) : $t->started_at;
            if ($lastAt->lessThan(now()->subMinutes(10)) && $this->create($user, 'track_check', 'track_check:'.$t->id)) {
                $made = true;
            }
        });

        return $made;
    }
}
