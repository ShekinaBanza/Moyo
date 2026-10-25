<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class HealthProfile extends Model
{
    protected $table = 'health_profiles';

    // user_id is never mass-assignable: ownership comes from the authenticated user.
    protected $guarded = ['id', 'user_id'];

    protected function casts(): array
    {
        return ['birth_date'=>'date:Y-m-d','last_evaluation_date'=>'date:Y-m-d','evaluated_by_professional'=>'boolean','height_cm'=>'float','sleep_goal_hours'=>'float','notifications_enabled'=>'boolean'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
