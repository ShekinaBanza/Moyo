<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Shared catalogue of activities with their MET value (not user data).
        Schema::create('activity_catalog', function (Blueprint $t) {
            $t->id();
            $t->string('slug', 60)->unique();
            $t->string('name', 120);
            $t->string('category', 40); // walking|running|cycling|sport|home|work|other
            $t->string('activity_type', 30); // maps to the legacy activity_entries.activity_type
            $t->decimal('met', 4, 1)->nullable(); // null = custom: MET derived from the declared intensity
            $t->boolean('is_custom')->default(false);
            $t->string('icon', 40)->nullable();
            $t->string('met_source', 190)->nullable();
            $t->unsignedSmallInteger('sort')->default(0);
            $t->timestamps();
        });

        Schema::create('gps_tracks', function (Blueprint $t) {
            $t->id();
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->string('client_id', 64)->nullable();
            $t->string('status', 20)->default('recording'); // recording|paused|finished|interrupted
            $t->string('source', 20)->default('gps');
            $t->string('label', 120)->nullable();
            $t->dateTime('started_at');
            $t->dateTime('ended_at')->nullable();
            $t->unsignedInteger('duration_seconds')->default(0); // active time only (pauses excluded)
            $t->unsignedInteger('distance_m')->default(0);
            $t->unsignedInteger('points_count')->default(0);
            $t->unsignedSmallInteger('rejected_points')->default(0);
            $t->unsignedSmallInteger('gap_count')->default(0);
            $t->decimal('avg_accuracy_m', 7, 1)->nullable();
            $t->unsignedTinyInteger('current_segment')->default(0);
            $t->string('end_reason', 40)->nullable(); // user|stale|permission_lost|signal_lost
            $t->timestamps();
            $t->index(['user_id', 'started_at']);
            $t->unique(['user_id', 'client_id']);
        });

        Schema::create('gps_track_points', function (Blueprint $t) {
            $t->id();
            $t->foreignId('track_id')->constrained('gps_tracks')->cascadeOnDelete();
            $t->unsignedTinyInteger('segment')->default(0); // incremented on resume: no distance across pauses
            $t->decimal('lat', 8, 5); // 5 decimals ~ 1 m: no more precision than needed
            $t->decimal('lng', 8, 5);
            $t->decimal('accuracy_m', 7, 1)->nullable();
            $t->dateTime('captured_at');
            $t->unique(['track_id', 'captured_at']); // idempotent re-sends
            $t->index(['track_id', 'segment', 'captured_at']);
        });

        Schema::table('activity_entries', function (Blueprint $t) {
            $t->foreignId('catalog_id')->nullable()->after('user_id')->constrained('activity_catalog')->nullOnDelete();
            $t->string('custom_label', 120)->nullable();
            $t->decimal('weight_kg', 5, 1)->nullable(); // weight used for the estimate (override)
            $t->string('distance_source', 20)->nullable(); // manual|gps|watch
            $t->foreignId('track_id')->nullable()->constrained('gps_tracks')->nullOnDelete();
        });

        Schema::table('health_profiles', function (Blueprint $t) {
            $t->string('activity_level', 20)->nullable(); // informational only: never added to the energy total
            $t->boolean('notifications_enabled')->default(true);
        });

        Schema::table('food_catalog', function (Blueprint $t) {
            // Indicative kcal per small/medium/large portion. Always presented as an ESTIMATE.
            $t->json('portion_kcal')->nullable();
            $t->string('portion_kcal_source', 190)->nullable();
        });

        Schema::create('notification_preferences', function (Blueprint $t) {
            $t->id();
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->string('kind', 40);
            $t->boolean('enabled')->default(false);
            $t->time('time_of_day')->default('20:00:00');
            $t->string('frequency', 12)->default('daily'); // daily|weekdays|weekly
            $t->unsignedTinyInteger('weekday')->nullable(); // 0=Sunday .. 6, for weekly
            $t->timestamps();
            $t->unique(['user_id', 'kind']);
        });

        Schema::create('notifications', function (Blueprint $t) {
            $t->id();
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->string('kind', 40);
            $t->string('title', 160);
            $t->string('body', 400)->nullable(); // never contains health values
            $t->string('link', 120)->nullable();
            $t->string('dedupe_key', 120);
            $t->timestamp('read_at')->nullable();
            $t->string('push_status', 20)->default('not_requested'); // not_requested|not_configured|sent|failed
            $t->timestamps();
            $t->unique(['user_id', 'dedupe_key']); // no duplicates
            $t->index(['user_id', 'read_at']);
        });

        Schema::create('push_subscriptions', function (Blueprint $t) {
            $t->id();
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->string('endpoint_hash', 64);
            $t->text('endpoint');
            $t->string('p256dh', 200);
            $t->string('auth', 100);
            $t->string('user_agent', 200)->nullable();
            $t->timestamp('last_success_at')->nullable();
            $t->unsignedTinyInteger('failures')->default(0);
            $t->timestamps();
            $t->unique(['user_id', 'endpoint_hash']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('push_subscriptions');
        Schema::dropIfExists('notifications');
        Schema::dropIfExists('notification_preferences');
        Schema::table('food_catalog', fn (Blueprint $t) => $t->dropColumn(['portion_kcal', 'portion_kcal_source']));
        Schema::table('health_profiles', fn (Blueprint $t) => $t->dropColumn(['activity_level', 'notifications_enabled']));
        Schema::table('activity_entries', function (Blueprint $t) {
            $t->dropConstrainedForeignId('track_id');
            $t->dropConstrainedForeignId('catalog_id');
            $t->dropColumn(['custom_label', 'weight_kg', 'distance_source']);
        });
        Schema::dropIfExists('gps_track_points');
        Schema::dropIfExists('gps_tracks');
        Schema::dropIfExists('activity_catalog');
    }
};
