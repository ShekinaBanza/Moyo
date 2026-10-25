<?php

namespace App\Models;

use App\Models\Concerns\StoresDatesInAppTimezone;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class WearableDevice extends Model
{
    use StoresDatesInAppTimezone;

    protected $table = 'wearable_devices';

    // user_id is never mass-assignable: ownership comes from the authenticated user.
    protected $guarded = ['id', 'user_id'];

    protected function casts(): array
    {
        return ['last_sync_at'=>'datetime'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function capabilities()
    {
        return $this->hasMany(WearableCapability::class, 'device_id');
    }
}
