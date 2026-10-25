<?php

namespace App\Http\Controllers\Api;

use App\Models\ActivityCatalogItem;
use App\Models\ActivityEntry;
use App\Models\GpsTrack;
use App\Services\EnergyService;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class ActivityEntryController extends OwnedCrudController
{
    protected string $modelClass = ActivityEntry::class;

    protected string $dateColumn = 'started_at';

    protected function rules(Request $request): array
    {
        $uid = $request->user()->id;

        return [
            'client_id' => 'nullable|string|max:64',
            'catalog_id' => 'nullable|integer|exists:activity_catalog,id',
            'custom_label' => 'nullable|string|max:120',
            'activity_type' => 'required_without:catalog_id|nullable|in:walking,steps,running,cycling,housework,other',
            'started_at' => 'required|date',
            'steps' => 'nullable|integer|min:0|max:100000',
            'duration_minutes' => 'nullable|integer|min:1|max:1440',
            'distance_km' => 'nullable|numeric|min:0|max:500',
            'distance_source' => 'nullable|in:manual,gps,watch',
            'perceived_effort' => 'nullable|integer|between:1,10',
            'weight_kg' => 'nullable|numeric|between:2,500',
            'notes' => 'nullable|string|max:2000',
            'source_type' => 'nullable|in:manual,gps,watch,imported',
            // a device or a track can only be one of the caller's own
            'device_id' => ['nullable', 'integer', Rule::exists('wearable_devices', 'id')->where('user_id', $uid)],
            'track_id' => ['nullable', 'integer', Rule::exists('gps_tracks', 'id')->where('user_id', $uid)],
        ];
    }

    protected function prepare(array $data, ?Model $existing): array
    {
        $catalogId = $data['catalog_id'] ?? $existing?->catalog_id;
        if ($catalogId) {
            $cat = ActivityCatalogItem::find($catalogId);
            if ($cat->is_custom && empty($data['custom_label'] ?? $existing?->custom_label)) {
                throw ValidationException::withMessages(['custom_label' => ['Donnez un nom à votre activité personnalisée.']]);
            }
            $data['activity_type'] = $cat->activity_type;
        }
        $data['activity_type'] = $data['activity_type'] ?? $existing?->activity_type ?? 'other';
        $data['source_type'] = $data['source_type'] ?? $existing?->source_type ?? 'manual';

        $trackId = $data['track_id'] ?? $existing?->track_id;
        if ($trackId) {
            $track = GpsTrack::find($trackId);
            if (! in_array($track->status, ['finished', 'interrupted'], true)) {
                throw ValidationException::withMessages(['track_id' => ["Terminez le trajet avant de l'associer à une activité."]]);
            }
            $source = $data['distance_source'] ?? $existing?->distance_source;
            if (isset($data['distance_km']) && $source && $source !== 'gps') {
                throw ValidationException::withMessages(['distance_km' => ['Un trajet GPS est associé : une seule source de distance est acceptée (pas de cumul GPS + montre ou saisie).']]);
            }
            // GPS distance replaces any other distance: the same movement is never counted twice.
            $data['distance_km'] = round($track->distance_m / 1000, 2);
            $data['distance_source'] = 'gps';
            if (empty($data['duration_minutes']) && ! $existing?->duration_minutes) {
                $data['duration_minutes'] = max(1, (int) round($track->duration_seconds / 60));
            }
        } elseif (isset($data['distance_km']) && empty($data['distance_source'])) {
            $data['distance_source'] = 'manual';
        }

        return $data;
    }

    public function index(Request $request): JsonResponse
    {
        $response = parent::index($request);

        return $this->withEstimates($request, $response);
    }

    public function store(Request $request): JsonResponse
    {
        return $this->withEstimate($request, parent::store($request));
    }

    public function update(Request $request, int $id): JsonResponse
    {
        return $this->withEstimate($request, parent::update($request, $id));
    }

    private function withEstimates(Request $request, JsonResponse $response): JsonResponse
    {
        $payload = $response->getData(true);
        $models = ActivityEntry::whereIn('id', array_column($payload['data'], 'id'))->get();
        $est = app(EnergyService::class)->estimateEntries($request->user(), $models);
        foreach ($payload['data'] as &$row) {
            $row['estimate'] = $est[$row['id']] ?? null;
        }
        $response->setData($payload);

        return $response;
    }

    private function withEstimate(Request $request, JsonResponse $response): JsonResponse
    {
        $payload = $response->getData(true);
        $model = ActivityEntry::find($payload['data']['id'] ?? 0);
        if ($model) {
            $payload['data']['estimate'] = app(EnergyService::class)->estimateEntries($request->user(), collect([$model]))[$model->id] ?? null;
            $response->setData($payload);
        }

        return $response;
    }
}
