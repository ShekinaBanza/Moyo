<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ConsentRecord;
use App\Models\GpsTrack;
use App\Services\AuditLogger;
use App\Services\TrackService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * GPS tracks. Owner = authenticated user. Starting a track requires the explicit "gps_tracking" consent
 * (checked here on the server, not only in the UI). Coordinates are never logged or placed in URLs.
 */
class TrackController extends Controller
{
    public function __construct(private TrackService $tracks) {}

    private function owned(Request $request, int $id): GpsTrack
    {
        $t = GpsTrack::where('user_id', $request->user()->id)->findOrFail($id);
        $this->authorize('view', $t);

        return $t;
    }

    public function index(Request $request): JsonResponse
    {
        $this->tracks->closeStale($request->user()->id);

        return response()->json(['data' => GpsTrack::where('user_id', $request->user()->id)->orderByDesc('started_at')->limit(min(200, (int) $request->query('limit', 50)))->get()]);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $this->tracks->closeStale($request->user()->id);
        $t = $this->owned($request, $id)->fresh();

        return response()->json(['data' => $t, 'points' => $t->points()->orderBy('captured_at')->get(['lat', 'lng', 'accuracy_m', 'captured_at', 'segment'])]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate(['client_id' => 'nullable|string|max:64', 'label' => 'nullable|string|max:120', 'started_at' => 'nullable|date']);
        $uid = $request->user()->id;

        $consent = ConsentRecord::where('user_id', $uid)->where('purpose', 'gps_tracking')->orderByDesc('id')->first();
        if (! $consent || ! $consent->granted) {
            return response()->json(['message' => "Le consentement à l'enregistrement de trajets GPS est nécessaire.", 'code' => 'gps_consent_required'], 403);
        }
        if (! empty($data['client_id']) && ($dup = GpsTrack::where('user_id', $uid)->where('client_id', $data['client_id'])->first())) {
            return response()->json(['data' => $dup, 'duplicate' => true]);
        }
        if (GpsTrack::where('user_id', $uid)->whereIn('status', ['recording', 'paused'])->exists()) {
            $this->tracks->closeStale($uid);
            if (GpsTrack::where('user_id', $uid)->whereIn('status', ['recording', 'paused'])->exists()) {
                return response()->json(['message' => 'Un trajet est déjà ouvert. Terminez-le avant d\'en commencer un autre.', 'code' => 'track_already_open'], 409);
            }
        }

        $t = new GpsTrack(['client_id' => $data['client_id'] ?? null, 'label' => $data['label'] ?? null, 'started_at' => $data['started_at'] ?? now(), 'status' => 'recording', 'source' => 'gps']);
        $t->user_id = $uid;
        $t->save();
        AuditLogger::log('track.started', $uid); // no coordinates in the audit trail

        return response()->json(['data' => $t], 201);
    }

    public function points(Request $request, int $id): JsonResponse
    {
        $t = $this->owned($request, $id);
        $this->authorize('update', $t);
        $data = $request->validate([
            'points' => 'required|array|min:1|max:500',
            'points.*.lat' => 'required|numeric|between:-90,90',
            'points.*.lng' => 'required|numeric|between:-180,180',
            'points.*.accuracy' => 'nullable|numeric|min:0|max:100000',
            'points.*.captured_at' => 'required|date',
            'points.*.segment' => 'nullable|integer|min:0|max:250',
        ]);
        if ($t->status === 'paused') {
            return response()->json(['message' => 'Le trajet est en pause.', 'code' => 'track_paused'], 409);
        }
        $result = $this->tracks->addPoints($t, $data['points']);

        return response()->json(['data' => $t->fresh(), 'result' => $result]);
    }

    public function pause(Request $request, int $id): JsonResponse
    {
        $t = $this->owned($request, $id);
        $this->authorize('update', $t);

        return response()->json(['data' => $this->tracks->pause($t)]);
    }

    public function resume(Request $request, int $id): JsonResponse
    {
        $t = $this->owned($request, $id);
        $this->authorize('update', $t);

        return response()->json(['data' => $this->tracks->resume($t)]);
    }

    public function finish(Request $request, int $id): JsonResponse
    {
        $t = $this->owned($request, $id);
        $this->authorize('update', $t);
        $data = $request->validate(['interrupted' => 'nullable|boolean', 'reason' => 'nullable|in:user,permission_lost,signal_lost']);

        return response()->json(['data' => $this->tracks->finish($t, (bool) ($data['interrupted'] ?? false), $data['reason'] ?? 'user')]);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $t = $this->owned($request, $id);
        $this->authorize('delete', $t);
        $t->delete(); // points removed by cascade; activities keep their numbers but lose the link (nullOnDelete)

        return response()->json(['deleted' => true]);
    }

    /** Deletes the whole track history of the user. */
    public function destroyAll(Request $request): JsonResponse
    {
        $n = GpsTrack::where('user_id', $request->user()->id)->delete();
        AuditLogger::log('tracks.purged', $request->user()->id, ['count' => $n]);

        return response()->json(['deleted' => $n]);
    }
}
