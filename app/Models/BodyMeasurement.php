<?php

namespace App\Models;

use App\Models\Concerns\StoresDatesInAppTimezone;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class BodyMeasurement extends Model
{
    use StoresDatesInAppTimezone;

    protected $table = 'body_measurements';

    // user_id is never mass-assignable: ownership comes from the authenticated user.
    protected $guarded = ['id', 'user_id'];

    protected function casts(): array
    {
        return ['measured_at'=>'datetime','value'=>'float'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
