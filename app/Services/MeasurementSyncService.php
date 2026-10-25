<?php

namespace App\Services;

use App\Models\HealthMeasurement;
use App\Models\SyncOperation;
use App\Models\User;
use App\Models\WearableDevice;
use Illuminate\Support\Carbon;

class MeasurementSyncService
{
    public function __construct(private MeasurementValidator $validator) {}

    /**
     * Idempotent: a (user, client_id) pair is stored once. The owner is always $user.
     * A value is never marked "verified" because it came from Bluetooth.
     */
    public function sync(User $user, ?WearableDevice $device, array $items): array
    {
        $now = now();
        $accepted = $duplicates = 0;
        $results = [];

        foreach ($items as $item) {
            $clientId = $item['client_id'];
            if (HealthMeasurement::where('user_id', $user->id)->where('client_id', $clientId)->exists()) {
                $duplicates++;
                $results[] = ['client_id' => $clientId, 'status' => 'duplicate'];

                continue;
            }
            $measuredAt = Carbon::parse($item['measured_at']);
            $error = $measuredAt->greaterThan($now->copy()->addMinutes(5))
                ? 'measured_in_future'
                : $this->validator->check($item['measurement_type'], isset($item['value_numeric']) ? (float) $item['value_numeric'] : null, $item['unit']);
            if ($error) {
                $results[] = ['client_id' => $clientId, 'status' => 'rejected', 'reason' => $error];

                continue;
            }

            $source = $item['source_type'];
            $quality = $source === 'manual' ? 'verified' : 'unverified';
            if ($source === 'watch' && $measuredAt->lessThan($now->copy()->subDay())) {
                $quality = 'stale';
            }

            $m = new HealthMeasurement([
                'client_id' => $clientId,
                'device_id' => $source === 'watch' ? $device?->id : null,
                'measurement_type' => $item['measurement_type'],
                'value_numeric' => $item['value_numeric'] ?? null,
                'value_json' => $item['value_json'] ?? null,
                'unit' => $item['unit'],
                'source_type' => $source,
                'source_reference' => $item['source_reference'] ?? null,
                'measured_at' => $measuredAt,
                'received_at' => $now,
                'quality_status' => $quality,
                'decoder_version' => $item['decoder_version'] ?? null,
            ]);
            $m->user_id = $user->id;
            $m->save();
            $accepted++;
            $results[] = ['client_id' => $clientId, 'status' => 'accepted', 'quality_status' => $quality];
        }

        $rejected = count($items) - $accepted - $duplicates;
        $op = new SyncOperation([
            'device_id' => $device?->id,
            'status' => $rejected === 0 ? 'completed' : ($accepted + $duplicates > 0 ? 'partial' : 'failed'),
            'received_count' => count($items),
            'accepted_count' => $accepted,
            'duplicate_count' => $duplicates,
            'rejected_count' => $rejected,
        ]);
        $op->user_id = $user->id;
        $op->save();

        if ($device && $accepted > 0) {
            $device->forceFill(['last_sync_at' => $now])->save();
        }

        return ['status' => $op->status, 'accepted' => $accepted, 'duplicates' => $duplicates, 'rejected' => $rejected, 'results' => $results];
    }
}
