<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\HealthMeasurement;
use App\Models\WearableDevice;
use App\Services\MeasurementSyncService;
use App\Services\MeasurementValidator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class MeasurementController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $q = HealthMeasurement::where('user_id', $request->user()->id);
        if ($type = $request->query('type')) {
            $q->where('measurement_type', $type);
        }
        if ($from = $request->query('from')) {
            $q->where('measured_at', '>=', $from);
        }

        return response()->json(['data' => $q->orderByDesc('measured_at')->limit(max(1, min(500, (int) $request->query('limit', 100))))->get()]);
    }

    public function sync(Request $request, MeasurementSyncService $service): JsonResponse
    {
        $userId = $request->user()->id;
        $data = $request->validate([
            // the device must belong to the caller, otherwise 422: nobody syncs "for" someone else
            'device_id' => ['nullable', 'integer', Rule::exists('wearable_devices', 'id')->where('user_id', $userId)],
            'measurements' => 'required|array|min:1|max:500',
            'measurements.*.client_id' => 'required|string|max:64',
            'measurements.*.measurement_type' => ['required', Rule::in(array_keys(MeasurementValidator::TYPES))],
            'measurements.*.value_numeric' => 'nullable|numeric',
            'measurements.*.value_json' => 'nullable|array',
            'measurements.*.unit' => 'required|string|max:20',
            'measurements.*.source_type' => 'required|in:manual,watch,imported',
            'measurements.*.source_reference' => 'nullable|string|max:190',
            'measurements.*.measured_at' => 'required|date',
            'measurements.*.decoder_version' => 'nullable|string|max:40',
        ]);

        $device = isset($data['device_id']) ? WearableDevice::where('user_id', $userId)->find($data['device_id']) : null;

        return response()->json(['data' => $service->sync($request->user(), $device, $data['measurements'])]);
    }
}
