<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ConsentRecord;
use App\Models\HealthProfile;
use App\Models\User;
use App\Services\AuditLogger;
use Illuminate\Auth\Events\PasswordReset;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;
use Illuminate\Validation\Rules\Password as PasswordRule;
use Illuminate\Validation\ValidationException;

/** Session (cookie) authentication for the same-domain SPA. Mounted on the web middleware group (CSRF + session). */
class AuthController extends Controller
{
    public const POLICY_VERSION = '2026-10';

    public function register(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => 'required|string|max:120',
            'email' => 'required|email:rfc|max:190|unique:users,email',
            'password' => ['required', 'confirmed', PasswordRule::min(10)->letters()->numbers()],
            'consent_health_data' => 'accepted',
        ]);

        $user = User::create(['name' => $data['name'], 'email' => Str::lower($data['email']), 'password' => $data['password']]);
        $user->healthProfile()->create([]);
        $user->consents()->create(['purpose' => 'health_data_processing', 'granted' => true, 'policy_version' => self::POLICY_VERSION]);
        AuditLogger::log('account.registered', $user->id);

        Auth::guard('web')->login($user);
        $request->session()->regenerate();

        return response()->json(['data' => $this->userPayload($user)], 201);
    }

    public function login(Request $request): JsonResponse
    {
        $data = $request->validate(['email' => 'required|email', 'password' => 'required|string']);
        $key = 'login:'.Str::lower($data['email']).'|'.$request->ip();

        if (RateLimiter::tooManyAttempts($key, 5)) {
            $seconds = RateLimiter::availableIn($key);
            throw ValidationException::withMessages(['email' => ["Trop de tentatives. Réessayez dans {$seconds} secondes."]]);
        }

        if (! Auth::guard('web')->attempt(['email' => Str::lower($data['email']), 'password' => $data['password']])) {
            RateLimiter::hit($key, 300);
            AuditLogger::log('auth.failed', null);
            throw ValidationException::withMessages(['email' => ['Adresse e-mail ou mot de passe incorrect.']]);
        }

        RateLimiter::clear($key);
        $request->session()->regenerate();
        AuditLogger::log('auth.login', Auth::guard('web')->id());

        return response()->json(['data' => $this->userPayload($request->user())]);
    }

    public function logout(Request $request): JsonResponse
    {
        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->json(['ok' => true]);
    }

    public function forgotPassword(Request $request): JsonResponse
    {
        $request->validate(['email' => 'required|email']);
        // Always the same answer: do not reveal which e-mails exist. Requires a real MAIL_* configuration.
        Password::sendResetLink($request->only('email'));

        return response()->json(['message' => "Si un compte existe pour cette adresse, un e-mail de réinitialisation a été envoyé."]);
    }

    public function resetPassword(Request $request): JsonResponse
    {
        $data = $request->validate([
            'token' => 'required|string',
            'email' => 'required|email',
            'password' => ['required', 'confirmed', PasswordRule::min(10)->letters()->numbers()],
        ]);

        $status = Password::reset($data, function (User $user, string $password) {
            $user->forceFill(['password' => $password, 'remember_token' => Str::random(60)])->save();
            event(new PasswordReset($user));
            AuditLogger::log('auth.password_reset', $user->id);
        });

        if ($status !== Password::PASSWORD_RESET) {
            throw ValidationException::withMessages(['email' => ['Lien invalide ou expiré.']]);
        }

        return response()->json(['message' => 'Mot de passe modifié.']);
    }

    public function userPayload(User $user): array
    {
        return ['id' => $user->id, 'name' => $user->name, 'email' => $user->email];
    }
}
