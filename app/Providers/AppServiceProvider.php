<?php

namespace App\Providers;

use App\Models\ActivityEntry;
use App\Models\BodyMeasurement;
use App\Models\FoodEntry;
use App\Models\GpsTrack;
use App\Models\HabitRecord;
use App\Models\HealthMeasurement;
use App\Models\SleepRecord;
use App\Models\SymptomEntry;
use App\Models\WearableDevice;
use App\Models\WorkoutSession;
use App\Policies\OwnedPolicy;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        //
    }

    public function boot(): void
    {
        foreach ([SleepRecord::class, FoodEntry::class, SymptomEntry::class, BodyMeasurement::class,
            ActivityEntry::class, HabitRecord::class, WearableDevice::class, HealthMeasurement::class, GpsTrack::class, WorkoutSession::class] as $model) {
            Gate::policy($model, OwnedPolicy::class);
        }

        RateLimiter::for('api', fn (Request $request) => Limit::perMinute(120)->by($request->user()?->id ?: $request->ip()));
    }
}
