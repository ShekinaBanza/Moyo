<?php

namespace App\Models;

use App\Models\Concerns\StoresDatesInAppTimezone;
use Illuminate\Database\Eloquent\Model;

class GpsTrackPoint extends Model
{
    use StoresDatesInAppTimezone;

    public $timestamps = false;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['lat' => 'float', 'lng' => 'float', 'accuracy_m' => 'float', 'captured_at' => 'datetime'];
    }
}
