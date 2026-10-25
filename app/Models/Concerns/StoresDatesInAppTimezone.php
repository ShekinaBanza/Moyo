<?php

namespace App\Models\Concerns;

/**
 * Eloquent writes a Carbon/ISO value in ITS OWN timezone and reads the column back in the app timezone.
 * A client value such as "2026-10-25T20:36:38Z" or "...+01:00" would therefore be shifted by the offset.
 * This converts every incoming date to the app timezone (UTC in production, see docs/DEPLOY_HOSTINGER.md)
 * before it is written, so the stored instant is always the real one.
 * Each user's own timezone (health_profiles.timezone) is only used for display, day boundaries and reminders.
 */
trait StoresDatesInAppTimezone
{
    public function fromDateTime($value)
    {
        if (empty($value)) {
            return $value;
        }

        return $this->asDateTime($value)->copy()->setTimezone(config('app.timezone'))->format($this->getDateFormat());
    }
}
