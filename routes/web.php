<?php

use App\Http\Controllers\Api\AuthController;
use Illuminate\Support\Facades\Route;

// Auth endpoints live on the web group: session + CSRF protection. Throttled on top of the per-account limiter.
Route::prefix('api/v1/auth')->group(function () {
    Route::post('register', [AuthController::class, 'register'])->middleware('throttle:10,1');
    Route::post('login', [AuthController::class, 'login'])->middleware('throttle:20,1');
    Route::post('logout', [AuthController::class, 'logout']);
    Route::post('forgot-password', [AuthController::class, 'forgotPassword'])->middleware('throttle:3,1');
    Route::post('reset-password', [AuthController::class, 'resetPassword'])->middleware('throttle:5,1');
});

// The React SPA (compiled by Vite) is served for every other GET route.
Route::get('/{any?}', fn () => view('app'))->where('any', '^(?!api/|up$|build/).*$');
