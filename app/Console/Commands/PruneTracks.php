<?php

namespace App\Console\Commands;

use App\Models\GpsTrackPoint;
use Illuminate\Console\Command;

class PruneTracks extends Command
{
    protected $signature = 'tracks:prune {--days=90 : keep raw GPS points this long}';

    protected $description = 'Delete raw GPS points of old tracks (the distance/duration summary of the track is kept)';

    public function handle(): int
    {
        $n = GpsTrackPoint::where('captured_at', '<', now()->subDays((int) $this->option('days')))->delete();
        $this->info("{$n} GPS point(s) deleted.");

        return self::SUCCESS;
    }
}
