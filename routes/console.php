<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Needs ONE cron entry on the host: * * * * * php /path/to/artisan schedule:run   (see docs/NOTIFICATIONS.md)
Schedule::command('notifications:generate')->everyFiveMinutes()->withoutOverlapping();
Schedule::command('tracks:prune')->dailyAt('03:30');
