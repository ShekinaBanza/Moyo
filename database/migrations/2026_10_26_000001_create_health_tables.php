<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('health_profiles', function (Blueprint $t) {
            $t->id();
            $t->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();
            $t->date('birth_date')->nullable();
            $t->string('sex', 20)->nullable();
            $t->decimal('height_cm', 5, 1)->nullable();
            $t->boolean('evaluated_by_professional')->nullable();
            $t->date('last_evaluation_date')->nullable();
            $t->decimal('sleep_goal_hours', 3, 1)->nullable();
            $t->unsignedInteger('steps_goal')->nullable();
            $t->string('timezone', 64)->default('Africa/Kinshasa');
            $t->timestamps();
        });

        Schema::create('wearable_devices', function (Blueprint $t) {
            $t->id();
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->string('name', 120);
            $t->string('model', 120)->nullable();
            $t->string('identifier', 190)->nullable();
            $t->string('connection_status', 20)->default('paired'); // paired|connected|disconnected|error
            $t->string('integration_status', 30)->default('unverified'); // unverified|verified
            $t->timestamp('last_sync_at')->nullable();
            $t->timestamps();
            $t->unique(['user_id', 'identifier']);
        });

        Schema::create('wearable_capabilities', function (Blueprint $t) {
            $t->id();
            $t->foreignId('device_id')->constrained('wearable_devices')->cascadeOnDelete();
            $t->string('measurement_type', 40);
            $t->boolean('confirmed')->default(false);
            $t->string('decoder_version', 40)->nullable();
            $t->text('notes')->nullable();
            $t->timestamps();
            $t->unique(['device_id', 'measurement_type']);
        });

        Schema::create('health_measurements', function (Blueprint $t) {
            $t->id();
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->foreignId('device_id')->nullable()->constrained('wearable_devices')->nullOnDelete();
            $t->string('client_id', 64)->nullable();
            $t->string('measurement_type', 40);
            $t->decimal('value_numeric', 14, 4)->nullable();
            $t->json('value_json')->nullable();
            $t->string('unit', 20);
            $t->string('source_type', 20); // manual|watch|imported
            $t->string('source_reference', 190)->nullable();
            $t->dateTime('measured_at');
            $t->dateTime('received_at');
            $t->string('quality_status', 20)->default('unverified'); // verified|unverified|invalid|stale
            $t->string('decoder_version', 40)->nullable();
            $t->timestamps();
            $t->index(['user_id', 'measurement_type', 'measured_at']);
            $t->unique(['user_id', 'client_id']);
        });

        Schema::create('sleep_records', function (Blueprint $t) {
            $t->id();
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->string('client_id', 64)->nullable();
            $t->date('night_date');
            $t->dateTime('bedtime');
            $t->dateTime('sleep_onset_at')->nullable();
            $t->dateTime('wake_time');
            $t->unsignedSmallInteger('night_awakenings')->nullable();
            $t->unsignedSmallInteger('awake_minutes')->nullable();
            $t->unsignedSmallInteger('time_in_bed_minutes');
            $t->unsignedSmallInteger('sleep_minutes');
            $t->unsignedTinyInteger('quality')->nullable(); // 1..5
            $t->unsignedTinyInteger('morning_energy')->nullable(); // 1..5
            $t->text('notes')->nullable();
            $t->string('source_type', 20)->default('manual');
            $t->foreignId('device_id')->nullable()->constrained('wearable_devices')->nullOnDelete();
            $t->timestamps();
            $t->index(['user_id', 'night_date']);
            $t->unique(['user_id', 'client_id']);
        });

        Schema::create('symptom_entries', function (Blueprint $t) {
            $t->id();
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->string('client_id', 64)->nullable();
            $t->string('symptom_type', 40); // breathlessness|swelling|fatigue|pain|dizziness|post_meal_discomfort|chest_pain|fainting|other
            $t->string('custom_label', 120)->nullable();
            $t->dateTime('occurred_at');
            $t->unsignedTinyInteger('intensity'); // 0..10
            $t->unsignedSmallInteger('duration_minutes')->nullable();
            $t->boolean('at_rest')->nullable();
            $t->string('context', 255)->nullable();
            $t->string('activity', 255)->nullable();
            $t->json('associated_symptoms')->nullable();
            $t->string('trend', 20)->nullable(); // better|same|worse
            $t->text('notes')->nullable();
            $t->timestamps();
            $t->index(['user_id', 'occurred_at']);
            $t->unique(['user_id', 'client_id']);
        });

        Schema::create('body_measurements', function (Blueprint $t) {
            $t->id();
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->string('client_id', 64)->nullable();
            $t->string('kind', 30); // weight|waist|hip|chest|arm|thigh
            $t->decimal('value', 6, 2);
            $t->string('unit', 10); // kg|cm
            $t->dateTime('measured_at');
            $t->text('notes')->nullable();
            $t->string('source_type', 20)->default('manual');
            $t->timestamps();
            $t->index(['user_id', 'kind', 'measured_at']);
            $t->unique(['user_id', 'client_id']);
        });

        Schema::create('food_catalog', function (Blueprint $t) {
            $t->id();
            $t->string('slug', 60)->unique();
            $t->string('name', 120);
            $t->string('category', 40);
            $t->string('default_unit', 20)->default('portion');
            $t->json('portion_hints')->nullable();
            $t->string('nutrition_status', 20)->default('unknown'); // verified|estimated|unknown
            $t->decimal('kcal_per_100g', 6, 1)->nullable();
            $t->string('nutrition_source', 190)->nullable();
            $t->string('image', 120)->nullable();
            $t->timestamps();
        });

        Schema::create('food_entries', function (Blueprint $t) {
            $t->id();
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->string('client_id', 64)->nullable();
            $t->foreignId('catalog_id')->nullable()->constrained('food_catalog')->nullOnDelete();
            $t->string('name', 160);
            $t->string('meal_type', 20); // breakfast|lunch|dinner|snack|drink
            $t->dateTime('eaten_at');
            $t->decimal('quantity', 8, 2)->nullable();
            $t->string('unit', 20)->nullable(); // small|medium|large|g|ml|piece|spoon
            $t->json('ingredients')->nullable();
            $t->string('feeling_after', 30)->nullable();
            $t->json('symptoms_after')->nullable();
            $t->decimal('kcal', 7, 1)->nullable();
            $t->string('nutrition_status', 20)->default('unknown'); // verified|estimated|unknown
            $t->string('nutrition_source', 190)->nullable();
            $t->text('notes')->nullable();
            $t->timestamps();
            $t->index(['user_id', 'eaten_at']);
            $t->unique(['user_id', 'client_id']);
        });

        Schema::create('activity_entries', function (Blueprint $t) {
            $t->id();
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->string('client_id', 64)->nullable();
            $t->string('activity_type', 30); // walking|steps|running|cycling|housework|other
            $t->dateTime('started_at');
            $t->unsignedInteger('steps')->nullable();
            $t->unsignedSmallInteger('duration_minutes')->nullable();
            $t->decimal('distance_km', 7, 2)->nullable();
            $t->unsignedTinyInteger('perceived_effort')->nullable(); // 1..10
            $t->text('notes')->nullable();
            $t->string('source_type', 20)->default('manual');
            $t->foreignId('device_id')->nullable()->constrained('wearable_devices')->nullOnDelete();
            $t->timestamps();
            $t->index(['user_id', 'started_at']);
            $t->unique(['user_id', 'client_id']);
        });

        Schema::create('habit_records', function (Blueprint $t) {
            $t->id();
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->string('client_id', 64)->nullable();
            $t->string('habit', 60); // water|no_soda|walk|vegetables|sleep_routine|custom
            $t->string('custom_label', 120)->nullable();
            $t->date('day');
            $t->boolean('done')->default(true);
            $t->text('notes')->nullable();
            $t->timestamps();
            $t->index(['user_id', 'day']);
            $t->unique(['user_id', 'client_id']);
        });

        Schema::create('reminders', function (Blueprint $t) {
            $t->id();
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->string('kind', 30); // meals|sleep|symptoms|measurement|habits
            $t->time('time_of_day');
            $t->boolean('enabled')->default(true);
            $t->timestamps();
            $t->unique(['user_id', 'kind']);
        });

        Schema::create('sync_operations', function (Blueprint $t) {
            $t->id();
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->foreignId('device_id')->nullable()->constrained('wearable_devices')->nullOnDelete();
            $t->string('status', 20); // completed|partial|failed
            $t->unsignedInteger('received_count')->default(0);
            $t->unsignedInteger('accepted_count')->default(0);
            $t->unsignedInteger('duplicate_count')->default(0);
            $t->unsignedInteger('rejected_count')->default(0);
            $t->timestamps();
            $t->index(['user_id', 'created_at']);
        });

        Schema::create('consent_records', function (Blueprint $t) {
            $t->id();
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->string('purpose', 40); // health_data_processing|wearable_sync|reminders
            $t->boolean('granted');
            $t->string('policy_version', 20);
            $t->timestamps();
            $t->index(['user_id', 'purpose']);
        });

        Schema::create('audit_events', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('user_id')->nullable()->index(); // no FK: survives account deletion, anonymised
            $t->string('event', 60);
            $t->json('meta')->nullable(); // never health values
            $t->string('ip_hash', 64)->nullable();
            $t->timestamps();
        });
    }

    public function down(): void
    {
        foreach (['audit_events', 'consent_records', 'sync_operations', 'reminders', 'habit_records', 'activity_entries',
            'food_entries', 'food_catalog', 'body_measurements', 'symptom_entries', 'sleep_records',
            'health_measurements', 'wearable_capabilities', 'wearable_devices', 'health_profiles'] as $table) {
            Schema::dropIfExists($table);
        }
    }
};
