<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Exercise extends Model
{
    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['muscles' => 'array', 'equipment' => 'array', 'steps' => 'array', 'mistakes' => 'array', 'prescriptions' => 'array'];
    }
}
