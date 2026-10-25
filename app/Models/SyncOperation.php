<?php

namespace App\Models;

use App\Models\Concerns\StoresDatesInAppTimezone;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SyncOperation extends Model
{
    use StoresDatesInAppTimezone;

    protected $table = 'sync_operations';

    // user_id is never mass-assignable: ownership comes from the authenticated user.
    protected $guarded = ['id', 'user_id'];

    protected function casts(): array
    {
        return [];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
