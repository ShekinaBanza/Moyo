<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Shared catalogue (not user data). Images: public/images/exercises/{slug}-start|end.svg
        Schema::create('exercises', function (Blueprint $t) {
            $t->id();
            $t->string('slug', 60)->unique();
            $t->string('name', 120);
            $t->string('category', 20); // musculation|abdominaux|mobilite|general
            $t->string('muscle_group', 30); // pectoraux|dos|epaules|biceps_triceps|jambes|fessiers|corps_entier|abdominaux|mobilite
            $t->json('muscles');
            $t->string('level', 20); // beginner|intermediate|advanced (lowest level it suits)
            $t->json('equipment'); // ["none"] or alternatives: dumbbells|bands|chair|wall|gym
            $t->string('kind', 10); // reps|time
            $t->json('steps');
            $t->text('breathing');
            $t->json('mistakes');
            $t->text('precautions');
            $t->text('easier_variant');
            $t->json('prescriptions'); // {beginner:{sets,reps|seconds,rest},...}
            $t->string('image_start', 120);
            $t->string('image_end', 120);
            $t->unsignedSmallInteger('sort')->default(0);
            $t->timestamps();
            $t->index(['category', 'muscle_group']);
        });

        Schema::create('workout_programs', function (Blueprint $t) {
            $t->id();
            $t->foreignId('user_id')->nullable()->constrained()->cascadeOnDelete(); // null = shared template (read-only)
            $t->string('name', 120);
            $t->string('goal', 20); // strength|abs|mobility|fitness
            $t->string('level', 20);
            $t->unsignedSmallInteger('target_minutes')->nullable();
            $t->json('equipment')->nullable();
            $t->json('muscle_groups')->nullable();
            $t->json('days')->nullable(); // 0=Sunday..6
            $t->text('description')->nullable();
            $t->boolean('is_template')->default(false);
            $t->timestamps();
            $t->index(['user_id', 'is_template']);
        });

        Schema::create('workout_program_exercises', function (Blueprint $t) {
            $t->id();
            $t->foreignId('program_id')->constrained('workout_programs')->cascadeOnDelete();
            $t->foreignId('exercise_id')->constrained('exercises')->cascadeOnDelete();
            $t->unsignedSmallInteger('position');
            $t->unsignedTinyInteger('sets');
            $t->unsignedSmallInteger('reps')->nullable();
            $t->unsignedSmallInteger('seconds')->nullable();
            $t->unsignedSmallInteger('rest_seconds')->default(60);
            $t->index(['program_id', 'position']);
        });

        Schema::create('workout_sessions', function (Blueprint $t) {
            $t->id();
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->string('client_id', 64)->nullable();
            $t->foreignId('program_id')->nullable()->constrained('workout_programs')->nullOnDelete();
            $t->string('name', 120);
            $t->dateTime('started_at');
            $t->dateTime('ended_at');
            $t->unsignedInteger('effective_seconds'); // time actually spent (pauses excluded)
            $t->string('status', 12)->default('finished'); // finished|stopped
            $t->unsignedTinyInteger('perceived_difficulty')->nullable(); // 1..5
            $t->text('notes')->nullable();
            $t->decimal('met', 4, 1)->nullable();
            $t->decimal('calories_est', 7, 1)->nullable(); // NET kcal, an ESTIMATE
            $t->string('calories_method', 255)->nullable();
            $t->foreignId('activity_entry_id')->nullable()->constrained('activity_entries')->nullOnDelete();
            $t->timestamps();
            $t->index(['user_id', 'started_at']);
            $t->unique(['user_id', 'client_id']);
        });

        Schema::create('workout_session_exercises', function (Blueprint $t) {
            $t->id();
            $t->foreignId('session_id')->constrained('workout_sessions')->cascadeOnDelete();
            $t->foreignId('exercise_id')->nullable()->constrained('exercises')->nullOnDelete();
            $t->string('name', 120); // snapshot: history stays readable if the catalogue changes
            $t->unsignedSmallInteger('position');
            $t->unsignedTinyInteger('planned_sets')->default(0);
            $t->json('sets'); // [{reps?:int, seconds?:int}] ONLY what was really done
            $t->boolean('skipped')->default(false);
            $t->index(['session_id', 'position']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('workout_session_exercises');
        Schema::dropIfExists('workout_sessions');
        Schema::dropIfExists('workout_program_exercises');
        Schema::dropIfExists('workout_programs');
        Schema::dropIfExists('exercises');
    }
};
