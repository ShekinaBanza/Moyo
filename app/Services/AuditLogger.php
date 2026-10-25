<?php

namespace App\Services;

use App\Models\AuditEvent;

/** Audit trail without any health values. IP is stored hashed. */
class AuditLogger
{
    public static function log(string $event, ?int $userId, array $meta = []): void
    {
        $ip = request()?->ip();
        AuditEvent::create([
            'user_id' => $userId,
            'event' => $event,
            'meta' => $meta ?: null,
            'ip_hash' => $ip ? hash_hmac('sha256', $ip, (string) config('app.key')) : null,
        ]);
    }
}
