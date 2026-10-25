<?php

use App\Http\Controllers\Api\AccountController;
use App\Http\Controllers\Api\ActivityEntryController;
use App\Http\Controllers\Api\BodyMeasurementController;
use App\Http\Controllers\Api\ConsentController;
use App\Http\Controllers\Api\DeviceController;
use App\Http\Controllers\Api\EnergyController;
use App\Http\Controllers\Api\ExerciseController;
use App\Http\Controllers\Api\FoodEntryController;
use App\Http\Controllers\Api\NotificationController;
use App\Http\Controllers\Api\TrackController;
use App\Http\Controllers\Api\WorkoutProgramController;
use App\Http\Controllers\Api\WorkoutSessionController;
use App\Http\Controllers\Api\HabitRecordController;
use App\Http\Controllers\Api\InsightsController;
use App\Http\Controllers\Api\MeasurementController;
use App\Http\Controllers\Api\ProfileController;
use App\Http\Controllers\Api\ReminderController;
use App\Http\Controllers\Api\SleepRecordController;
use App\Http\Controllers\Api\SymptomEntryController;
use Illuminate\Support\Facades\Route;

// All private routes: authenticated user only, owner derived from the session. See routes/web.php for auth endpoints.
Route::prefix('v1')->middleware(['auth:sanctum', 'throttle:api'])->group(function () {
    Route::get('me', [ProfileController::class, 'me']);
    Route::patch('profile', [ProfileController::class, 'update']);

    Route::get('dashboard', [InsightsController::class, 'dashboard']);
    Route::get('trends', [InsightsController::class, 'trends']);
    Route::get('safety-status', [InsightsController::class, 'safetyStatus']);
    Route::get('food-catalog', [InsightsController::class, 'foodCatalog']);

    foreach ([
        'sleep-records' => SleepRecordController::class,
        'food-entries' => FoodEntryController::class,
        'symptoms' => SymptomEntryController::class,
        'body-measurements' => BodyMeasurementController::class,
        'activity-entries' => ActivityEntryController::class,
        'habits' => HabitRecordController::class,
    ] as $uri => $controller) {
        Route::get($uri, [$controller, 'index']);
        Route::post($uri, [$controller, 'store']);
        Route::get("$uri/{id}", [$controller, 'show'])->whereNumber('id');
        Route::patch("$uri/{id}", [$controller, 'update'])->whereNumber('id');
        Route::delete("$uri/{id}", [$controller, 'destroy'])->whereNumber('id');
    }

    Route::get('reminders', [ReminderController::class, 'index']);
    Route::put('reminders/{kind}', [ReminderController::class, 'upsert']);

    Route::get('devices', [DeviceController::class, 'index']);
    Route::post('devices', [DeviceController::class, 'store']);
    Route::patch('devices/{id}', [DeviceController::class, 'update'])->whereNumber('id');
    Route::delete('devices/{id}', [DeviceController::class, 'destroy'])->whereNumber('id');
    Route::post('devices/{id}/capabilities', [DeviceController::class, 'upsertCapability'])->whereNumber('id');
    Route::get('devices/{id}/capabilities', [DeviceController::class, 'capabilities'])->whereNumber('id');
    Route::get('sync-operations', [DeviceController::class, 'syncHistory']);

    Route::get('measurements', [MeasurementController::class, 'index']);
    Route::post('measurements/sync', [MeasurementController::class, 'sync']);

    // Energy balance, day timeline, activity catalogue
    Route::get('energy/daily', [EnergyController::class, 'daily']);
    Route::get('energy/history', [EnergyController::class, 'history']);
    Route::get('activity-catalog', [EnergyController::class, 'activityCatalog']);
    Route::get('day', [EnergyController::class, 'day']);

    // GPS tracks (explicit consent required to start)
    Route::get('tracks', [TrackController::class, 'index']);
    Route::post('tracks', [TrackController::class, 'store']);
    Route::delete('tracks', [TrackController::class, 'destroyAll']);
    Route::get('tracks/{id}', [TrackController::class, 'show'])->whereNumber('id');
    Route::post('tracks/{id}/points', [TrackController::class, 'points'])->whereNumber('id');
    Route::post('tracks/{id}/pause', [TrackController::class, 'pause'])->whereNumber('id');
    Route::post('tracks/{id}/resume', [TrackController::class, 'resume'])->whereNumber('id');
    Route::post('tracks/{id}/finish', [TrackController::class, 'finish'])->whereNumber('id');
    Route::delete('tracks/{id}', [TrackController::class, 'destroy'])->whereNumber('id');

    // Exercises: shared catalogue + private programs and sessions
    Route::get('exercises', [ExerciseController::class, 'index']);
    Route::get('exercises/access', [ExerciseController::class, 'access']);
    Route::get('exercises/{slug}', [ExerciseController::class, 'show']);
    Route::get('workout-programs', [WorkoutProgramController::class, 'index']);
    Route::post('workout-programs', [WorkoutProgramController::class, 'store']);
    Route::get('workout-programs/{id}', [WorkoutProgramController::class, 'show'])->whereNumber('id');
    Route::patch('workout-programs/{id}', [WorkoutProgramController::class, 'update'])->whereNumber('id');
    Route::delete('workout-programs/{id}', [WorkoutProgramController::class, 'destroy'])->whereNumber('id');
    Route::post('workout-programs/{id}/duplicate', [WorkoutProgramController::class, 'duplicate'])->whereNumber('id');
    Route::get('workout-sessions', [WorkoutSessionController::class, 'index']);
    Route::post('workout-sessions', [WorkoutSessionController::class, 'store']);
    Route::get('workout-sessions/{id}', [WorkoutSessionController::class, 'show'])->whereNumber('id');
    Route::patch('workout-sessions/{id}', [WorkoutSessionController::class, 'update'])->whereNumber('id');
    Route::delete('workout-sessions/{id}', [WorkoutSessionController::class, 'destroy'])->whereNumber('id');
    Route::post('workout-sessions/{id}/log-activity', [WorkoutSessionController::class, 'logActivity'])->whereNumber('id');

    // Notifications (in-app + optional browser push)
    Route::get('notifications', [NotificationController::class, 'index']);
    Route::get('notifications/unread-count', [NotificationController::class, 'unread']);
    Route::post('notifications/read-all', [NotificationController::class, 'readAll']);
    Route::post('notifications/{id}/read', [NotificationController::class, 'read'])->whereNumber('id');
    Route::delete('notifications/{id}', [NotificationController::class, 'destroy'])->whereNumber('id');
    Route::get('notification-preferences', [NotificationController::class, 'preferences']);
    Route::patch('notification-preferences', [NotificationController::class, 'updatePreferences']);
    Route::post('push-subscriptions', [NotificationController::class, 'subscribe']);
    Route::delete('push-subscriptions', [NotificationController::class, 'unsubscribe']);
    Route::post('push-subscriptions/test', [NotificationController::class, 'testPush']);

    Route::get('consents', [ConsentController::class, 'index']);
    Route::post('consents', [ConsentController::class, 'store']);

    Route::post('account/export', [AccountController::class, 'export']);
    Route::delete('account', [AccountController::class, 'destroy']);
});
