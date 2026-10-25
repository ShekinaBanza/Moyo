<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\NotificationPreference;
use App\Models\PushSubscription;
use App\Models\UserNotification;
use App\Services\NotificationScheduler;
use App\Services\WebPushSender;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class NotificationController extends Controller
{
    public function __construct(private NotificationScheduler $scheduler) {}

    /** Opening the list also generates what is due now (works without any cron). */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $this->scheduler->generateFor($user);
        $q = UserNotification::where('user_id', $user->id);

        return response()->json([
            'data' => (clone $q)->orderByDesc('created_at')->orderByDesc('id')->limit(100)->get(),
            'unread' => (clone $q)->whereNull('read_at')->count(),
        ]);
    }

    public function unread(Request $request): JsonResponse
    {
        $this->scheduler->generateFor($request->user());

        return response()->json(['unread' => UserNotification::where('user_id', $request->user()->id)->whereNull('read_at')->count()]);
    }

    public function read(Request $request, int $id): JsonResponse
    {
        $n = UserNotification::where('user_id', $request->user()->id)->findOrFail($id);
        $n->forceFill(['read_at' => $n->read_at ?? now()])->save();

        return response()->json(['data' => $n]);
    }

    public function readAll(Request $request): JsonResponse
    {
        UserNotification::where('user_id', $request->user()->id)->whereNull('read_at')->update(['read_at' => now()]);

        return response()->json(['ok' => true]);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        UserNotification::where('user_id', $request->user()->id)->findOrFail($id)->delete();

        return response()->json(['deleted' => true]);
    }

    public function preferences(Request $request): JsonResponse
    {
        $user = $request->user();
        $profile = $user->healthProfile()->firstOrCreate([]);

        return response()->json(['data' => [
            'enabled' => (bool) ($profile->notifications_enabled ?? true),
            'timezone' => $profile->timezone,
            'preferences' => $this->scheduler->preferencesFor($user),
            'push' => [
                'server_configured' => WebPushSender::configured(),
                'public_key' => WebPushSender::configured() ? config('webpush.public_key') : null,
                'subscriptions' => PushSubscription::where('user_id', $user->id)->count(),
            ],
        ]]);
    }

    public function updatePreferences(Request $request): JsonResponse
    {
        $kinds = array_keys(NotificationScheduler::KINDS);
        $data = $request->validate([
            'enabled' => 'sometimes|boolean',
            'timezone' => ['sometimes', Rule::in(timezone_identifiers_list())],
            'preferences' => 'sometimes|array',
            'preferences.*.kind' => ['required', Rule::in($kinds)],
            'preferences.*.enabled' => 'sometimes|boolean',
            'preferences.*.time_of_day' => 'sometimes|date_format:H:i',
            'preferences.*.frequency' => 'sometimes|in:daily,weekdays,weekly',
            'preferences.*.weekday' => 'sometimes|nullable|integer|between:0,6',
        ]);
        $user = $request->user();
        $profile = $user->healthProfile()->firstOrCreate([]);
        $profile->fill(array_intersect_key($data, array_flip(['timezone'])));
        if (array_key_exists('enabled', $data)) {
            $profile->notifications_enabled = $data['enabled'];
        }
        $profile->save();

        foreach ($data['preferences'] ?? [] as $p) {
            $row = NotificationPreference::firstOrNew(['user_id' => $user->id, 'kind' => $p['kind']]);
            $row->user_id = $user->id;
            $row->fill(array_filter(['enabled' => $p['enabled'] ?? null, 'time_of_day' => isset($p['time_of_day']) ? $p['time_of_day'].':00' : null, 'frequency' => $p['frequency'] ?? null], fn ($v) => $v !== null));
            if (array_key_exists('weekday', $p)) {
                $row->weekday = $p['weekday'];
            }
            $row->save();
        }

        return $this->preferences($request);
    }

    /** Public key the browser needs to subscribe. 503 when the server cannot send pushes. */
    public function subscribe(Request $request): JsonResponse
    {
        $data = $request->validate([
            'endpoint' => 'required|url|max:1000',
            'keys.p256dh' => 'required|string|max:200',
            'keys.auth' => 'required|string|max:100',
        ]);
        if (! WebPushSender::configured()) {
            return response()->json(['message' => "L'envoi de notifications push n'est pas configuré sur ce serveur. Les notifications dans l'application restent actives.", 'code' => 'push_not_configured'], 503);
        }
        $sub = PushSubscription::firstOrNew(['user_id' => $request->user()->id, 'endpoint_hash' => hash('sha256', $data['endpoint'])]);
        $sub->user_id = $request->user()->id;
        $sub->fill(['endpoint' => $data['endpoint'], 'p256dh' => $data['keys']['p256dh'], 'auth' => $data['keys']['auth'], 'user_agent' => substr((string) $request->userAgent(), 0, 200)])->save();

        return response()->json(['ok' => true], 201);
    }

    public function unsubscribe(Request $request): JsonResponse
    {
        $data = $request->validate(['endpoint' => 'required|url|max:1000']);
        PushSubscription::where('user_id', $request->user()->id)->where('endpoint_hash', hash('sha256', $data['endpoint']))->delete();

        return response()->json(['ok' => true]);
    }

    /** Sends a test through the REAL push channel; reports honestly what happened. */
    public function testPush(Request $request, WebPushSender $sender): JsonResponse
    {
        $user = $request->user();
        if (! WebPushSender::configured()) {
            return response()->json(['status' => 'not_configured', 'message' => "Aucune infrastructure d'envoi push n'est configurée sur ce serveur."], 200);
        }
        $n = $this->scheduler->create($user, 'unsynced_entries', 'test:'.now()->timestamp, 'Test de notification', 'Si vous voyez ce message, les notifications du navigateur fonctionnent.');
        $status = $n?->push_status ?? 'not_requested';

        return response()->json(['status' => $status, 'message' => match ($status) {
            'sent' => 'Notification envoyée au service push du navigateur.',
            'not_requested' => "Aucun appareil n'est abonné aux notifications du navigateur.",
            default => "L'envoi a échoué.",
        }]);
    }
}
