<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ActivityCatalogItem extends Model
{
    protected $table = 'activity_catalog';

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['met' => 'float', 'is_custom' => 'boolean'];
    }
}
