<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class WorkoutSessionExercise extends Model
{
    public $timestamps = false;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['sets' => 'array', 'skipped' => 'boolean'];
    }
}
