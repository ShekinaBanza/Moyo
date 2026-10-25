<?php

namespace App\Services;

use App\Models\User;

class AccountExportService
{
    private const OWNED = [
        'profile' => 'healthProfile',
        'sleep_records' => 'sleepRecords',
        'symptoms' => 'symptomEntries',
        'body_measurements' => 'bodyMeasurements',
        'food_entries' => 'foodEntries',
        'activity_entries' => 'activityEntries',
        'habits' => 'habitRecords',
        'reminders' => 'reminders',
        'devices' => 'devices',
        'measurements' => 'measurements',
        'consents' => 'consents',
        'gps_tracks' => 'gpsTracks',
        'workout_programs' => 'workoutPrograms',
        'workout_sessions' => 'workoutSessions',
        'notification_preferences' => 'notificationPreferences',
    ];

    public function export(User $user): array
    {
        $out = [
            'exported_at' => now()->toIso8601String(),
            'account' => ['name' => $user->name, 'email' => $user->email, 'created_at' => $user->created_at],
        ];
        foreach (self::OWNED as $key => $relation) {
            $out[$key] = $user->{$relation};
        }

        return $out;
    }
}
