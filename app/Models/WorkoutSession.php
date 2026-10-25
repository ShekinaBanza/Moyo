<?php

namespace App\Models;

use App\Models\Concerns\StoresDatesInAppTimezone;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class WorkoutSession extends Model
{
    use StoresDatesInAppTimezone;

    protected $guarded = ['id', 'user_id'];

    protected function casts(): array
    {
        return ['started_at' => 'datetime', 'ended_at' => 'datetime', 'met' => 'float', 'calories_est' => 'float'];
    }

    public function items(): HasMany
    {
        return $this->hasMany(WorkoutSessionExercise::class, 'session_id')->orderBy('position');
    }
}
