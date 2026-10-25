<?php

namespace App\Console\Commands;

use App\Models\User;
use App\Services\NotificationScheduler;
use App\Services\TrackService;
use Illuminate\Console\Command;

class GenerateNotifications extends Command
{
    protected $signature = 'notifications:generate';

    protected $description = 'Create due in-app reminders (and send web push when configured) for users who enabled them';

    public function handle(NotificationScheduler $scheduler, TrackService $tracks): int
    {
        $created = 0;
        User::whereHas('notificationPreferences', fn ($q) => $q->where('enabled', true))->each(function (User $u) use ($scheduler, $tracks, &$created) {
            $tracks->closeStale($u->id);
            $created += $scheduler->generateFor($u);
        });
        $this->info("{$created} notification(s) created.");

        return self::SUCCESS;
    }
}
