<?php

namespace App\Models;

use App\Models\Concerns\StoresDatesInAppTimezone;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SleepRecord extends Model
{
    use StoresDatesInAppTimezone;

    protected $table = 'sleep_records';

    // user_id is never mass-assignable: ownership comes from the authenticated user.
    protected $guarded = ['id', 'user_id'];

    protected function casts(): array
    {
        return ['night_date'=>'date:Y-m-d','bedtime'=>'datetime','sleep_onset_at'=>'datetime','wake_time'=>'datetime'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
