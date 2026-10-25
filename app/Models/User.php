<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    /** @use HasFactory<\Database\Factories\UserFactory> */
    use HasApiTokens, HasFactory, Notifiable;

    protected $fillable = ['name', 'email', 'password'];

    protected $hidden = ['password', 'remember_token'];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
        ];
    }

    public function healthProfile(): HasOne
    {
        return $this->hasOne(HealthProfile::class);
    }

    public function sleepRecords(): HasMany { return $this->hasMany(SleepRecord::class); }

    public function symptomEntries(): HasMany { return $this->hasMany(SymptomEntry::class); }

    public function bodyMeasurements(): HasMany { return $this->hasMany(BodyMeasurement::class); }

    public function foodEntries(): HasMany { return $this->hasMany(FoodEntry::class); }

    public function activityEntries(): HasMany { return $this->hasMany(ActivityEntry::class); }

    public function habitRecords(): HasMany { return $this->hasMany(HabitRecord::class); }

    public function reminders(): HasMany { return $this->hasMany(Reminder::class); }

    public function devices(): HasMany { return $this->hasMany(WearableDevice::class); }

    public function measurements(): HasMany { return $this->hasMany(HealthMeasurement::class); }

    public function consents(): HasMany { return $this->hasMany(ConsentRecord::class); }

    public function workoutPrograms(): HasMany { return $this->hasMany(WorkoutProgram::class)->with('items'); }

    public function workoutSessions(): HasMany { return $this->hasMany(WorkoutSession::class)->with('items'); }

    public function gpsTracks(): HasMany { return $this->hasMany(GpsTrack::class); }

    public function notificationPreferences(): HasMany { return $this->hasMany(NotificationPreference::class); }

    public function pushSubscriptions(): HasMany { return $this->hasMany(PushSubscription::class); }
}
