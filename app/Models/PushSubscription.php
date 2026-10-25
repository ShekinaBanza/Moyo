<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PushSubscription extends Model
{
    protected $guarded = ['id', 'user_id'];

    protected $hidden = ['endpoint', 'p256dh', 'auth'];

    protected function casts(): array
    {
        return ['last_success_at' => 'datetime'];
    }
}
