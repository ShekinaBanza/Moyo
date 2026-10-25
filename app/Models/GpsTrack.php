<?php

namespace App\Models;

use App\Models\Concerns\StoresDatesInAppTimezone;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class GpsTrack extends Model
{
    use StoresDatesInAppTimezone;

    protected $guarded = ['id', 'user_id'];

    protected function casts(): array
    {
        return ['started_at' => 'datetime', 'ended_at' => 'datetime', 'avg_accuracy_m' => 'float'];
    }

    public function points(): HasMany
    {
        return $this->hasMany(GpsTrackPoint::class, 'track_id');
    }
}
