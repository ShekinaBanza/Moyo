<?php

namespace App\Models;

use App\Models\Concerns\StoresDatesInAppTimezone;
use Illuminate\Database\Eloquent\Model;

class UserNotification extends Model
{
    use StoresDatesInAppTimezone;

    protected $table = 'notifications';

    protected $guarded = ['id', 'user_id'];

    protected function casts(): array
    {
        return ['read_at' => 'datetime'];
    }
}
