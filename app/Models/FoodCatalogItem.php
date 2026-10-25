<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class FoodCatalogItem extends Model
{
    protected $table = 'food_catalog';

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['portion_hints' => 'array', 'portion_kcal' => 'array', 'kcal_per_100g' => 'float'];
    }
}
