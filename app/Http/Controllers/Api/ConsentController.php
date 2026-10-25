<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ConsentRecord;
use App\Services\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ConsentController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $latest = ConsentRecord::where('user_id', $request->user()->id)->orderBy('id')->get()->groupBy('purpose')->map->last()->values();

        return response()->json(['data' => $latest]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'purpose' => 'required|in:health_data_processing,wearable_sync,reminders,gps_tracking,push_notifications',
            'granted' => 'required|boolean',
        ]);
        $record = new ConsentRecord($data + ['policy_version' => AuthController::POLICY_VERSION]);
        $record->user_id = $request->user()->id;
        $record->save();
        AuditLogger::log('consent.changed', $request->user()->id, ['purpose' => $data['purpose'], 'granted' => $data['granted']]);

        return response()->json(['data' => $record], 201);
    }
}
