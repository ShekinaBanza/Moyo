<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\SyncOperation;
use App\Models\WearableCapability;
use App\Models\WearableDevice;
use App\Services\MeasurementValidator;
use Illuminate\Validation\Rule;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DeviceController extends Controller
{
    private function owned(Request $request, int $id): WearableDevice
    {
        $device = WearableDevice::where('user_id', $request->user()->id)->findOrFail($id);
        $this->authorize('view', $device);

        return $device;
    }

    public function index(Request $request): JsonResponse
    {
        return response()->json(['data' => WearableDevice::where('user_id', $request->user()->id)->with('capabilities')->latest()->get()]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => 'required|string|max:120',
            'model' => 'nullable|string|max:120',
            'identifier' => 'nullable|string|max:190',
        ]);
        // The same physical device (BLE identifier) is associated once per account.
        if (! empty($data['identifier']) && ($existing = WearableDevice::where('user_id', $request->user()->id)->where('identifier', $data['identifier'])->first())) {
            return response()->json(['data' => $existing->load('capabilities'), 'existing' => true]);
        }
        $device = new WearableDevice($data);
        $device->user_id = $request->user()->id;
        // Association is not verification: the integration stays "unverified" until a decoder is validated.
        $device->connection_status = 'paired';
        $device->integration_status = 'unverified';
        $device->save();

        return response()->json(['data' => $device], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $device = $this->owned($request, $id);
        $this->authorize('update', $device);
        $device->fill($request->validate([
            'name' => 'sometimes|string|max:120',
            'connection_status' => 'sometimes|in:paired,connected,disconnected,error',
        ]))->save();

        return response()->json(['data' => $device]);
    }

    /**
     * Records which data types were REALLY decoded from this device. "confirmed" needs a decoder version:
     * a type is never listed as supported because the watch merely exposes a service.
     */
    public function upsertCapability(Request $request, int $id): JsonResponse
    {
        $device = $this->owned($request, $id);
        $this->authorize('update', $device);
        $data = $request->validate([
            'measurement_type' => ['required', Rule::in(array_keys(MeasurementValidator::TYPES))],
            'confirmed' => 'required|boolean',
            'decoder_version' => 'required_if:confirmed,true|nullable|string|max:40',
            'notes' => 'nullable|string|max:500',
        ]);
        $cap = WearableCapability::firstOrNew(['device_id' => $device->id, 'measurement_type' => $data['measurement_type']]);
        $cap->fill($data)->save();
        $device->forceFill(['integration_status' => $device->capabilities()->where('confirmed', true)->exists() ? 'partial' : 'unverified'])->save();

        return response()->json(['data' => $cap, 'integration_status' => $device->integration_status]);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $device = $this->owned($request, $id);
        $this->authorize('delete', $device);
        $device->delete();

        return response()->json(['deleted' => true]);
    }

    public function capabilities(Request $request, int $id): JsonResponse
    {
        $device = $this->owned($request, $id);

        return response()->json([
            'data' => $device->capabilities()->get(),
            'integration_status' => $device->integration_status,
            'note' => match ($device->integration_status) {
                'verified' => null,
                'partial' => "Intégration partielle : seuls les types ci-dessous ont été réellement lus (formats standard Bluetooth). Le reste n'est pas interprété.",
                default => "Intégration en cours de vérification : aucune mesure de cet appareil n'est interprétée tant que le protocole n'est pas confirmé.",
            },
        ]);
    }

    public function syncHistory(Request $request): JsonResponse
    {
        return response()->json(['data' => SyncOperation::where('user_id', $request->user()->id)->latest()->limit(50)->get()]);
    }
}
