<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\AccountExportService;
use App\Services\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class AccountController extends Controller
{
    public function export(Request $request, AccountExportService $service): JsonResponse
    {
        AuditLogger::log('account.exported', $request->user()->id);

        return response()->json($service->export($request->user()))
            ->header('Content-Disposition', 'attachment; filename="health-companion-export.json"')
            ->header('Cache-Control', 'no-store');
    }

    /** Requires the current password and the explicit phrase; all health rows are removed by cascade. */
    public function destroy(Request $request): JsonResponse
    {
        $data = $request->validate(['password' => 'required|string', 'confirmation' => 'required|in:SUPPRIMER']);
        $user = $request->user();
        if (! Hash::check($data['password'], $user->password)) {
            throw ValidationException::withMessages(['password' => ['Mot de passe incorrect.']]);
        }

        $id = $user->id;
        $user->tokens()->delete();
        Auth::guard('web')->logout();
        $user->delete();
        // Anonymise the audit trail of this account: keep event names/dates, drop the hashed IP.
        \App\Models\AuditEvent::where('user_id', $id)->update(['ip_hash' => null, 'meta' => null]);
        AuditLogger::log('account.deleted', null);
        if ($request->hasSession()) {
            $request->session()->invalidate();
        }

        return response()->json(['deleted' => true]);
    }
}
