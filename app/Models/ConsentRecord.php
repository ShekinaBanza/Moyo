<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ConsentRecord extends Model
{
    protected $table = 'consent_records';

    // user_id is never mass-assignable: ownership comes from the authenticated user.
    protected $guarded = ['id', 'user_id'];

    protected function casts(): array
    {
        return ['granted'=>'boolean'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
