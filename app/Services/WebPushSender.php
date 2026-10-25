<?php

namespace App\Services;

use App\Models\PushSubscription;
use App\Models\User;
use App\Models\UserNotification;
use Minishlink\WebPush\Subscription;
use Minishlink\WebPush\WebPush;

/**
 * Sends browser push messages ONLY when VAPID keys are configured. Otherwise it reports "not_configured"
 * and nothing is claimed as sent. Payloads never contain health values (title/body/link only).
 */
class WebPushSender
{
    public static function configured(): bool
    {
        return config('webpush.public_key') && config('webpush.private_key') && class_exists(WebPush::class);
    }

    /** @return 'not_requested'|'not_configured'|'sent'|'failed' */
    public function send(User $user, UserNotification $n): string
    {
        $subs = PushSubscription::where('user_id', $user->id)->get();
        if ($subs->isEmpty()) {
            return 'not_requested';
        }
        if (! self::configured()) {
            return 'not_configured';
        }

        $webPush = new WebPush(['VAPID' => [
            'subject' => config('webpush.subject'),
            'publicKey' => config('webpush.public_key'),
            'privateKey' => config('webpush.private_key'),
        ]]);
        $payload = json_encode(['title' => $n->title, 'body' => $n->body, 'link' => $n->link, 'id' => $n->id]);
        foreach ($subs as $s) {
            $webPush->queueNotification(Subscription::create(['endpoint' => $s->endpoint, 'publicKey' => $s->p256dh, 'authToken' => $s->auth]), $payload);
        }

        $ok = 0;
        $byHash = $subs->keyBy(fn ($s) => $s->endpoint);
        foreach ($webPush->flush() as $report) {
            $sub = $byHash->get($report->getEndpoint());
            if ($report->isSuccess()) {
                $ok++;
                $sub?->forceFill(['last_success_at' => now(), 'failures' => 0])->save();
            } elseif ($sub) {
                if ($report->isSubscriptionExpired()) {
                    $sub->delete(); // 404/410: the browser dropped the subscription
                } else {
                    $sub->forceFill(['failures' => min(255, $sub->failures + 1)])->save();
                }
            }
        }

        return $ok > 0 ? 'sent' : 'failed';
    }
}
