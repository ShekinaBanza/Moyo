<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class WorkoutProgram extends Model
{
    // user_id is never mass-assignable; templates have user_id = null and are read-only.
    protected $guarded = ['id', 'user_id', 'is_template'];

    protected function casts(): array
    {
        return ['equipment' => 'array', 'muscle_groups' => 'array', 'days' => 'array', 'is_template' => 'boolean'];
    }

    public function items(): HasMany
    {
        return $this->hasMany(WorkoutProgramExercise::class, 'program_id')->orderBy('position');
    }

    /** Estimated duration: work (3 s per rep, or the given seconds) + rest, for every set. */
    public function estimatedMinutes(): int
    {
        $s = $this->items->sum(fn ($i) => $i->sets * (($i->seconds ?? ($i->reps ?? 10) * 3) + $i->rest_seconds));

        return (int) max(1, round($s / 60));
    }
}
