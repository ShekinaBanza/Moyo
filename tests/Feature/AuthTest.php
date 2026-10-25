<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AuthTest extends TestCase
{
    use RefreshDatabase;

    private array $reg = ['name' => 'Alice', 'email' => 'alice@example.com', 'password' => 'Secret12345', 'password_confirmation' => 'Secret12345', 'consent_health_data' => true];

    public function test_register_login_logout_flow_keeps_data_after_relogin(): void
    {
        $this->postJson('/api/v1/auth/register', $this->reg)->assertCreated();
        $this->assertDatabaseHas('consent_records', ['purpose' => 'health_data_processing', 'granted' => true]);
        $this->getJson('/api/v1/me')->assertOk()->assertJsonPath('data.email', 'alice@example.com');
        $this->postJson('/api/v1/body-measurements', ['kind' => 'weight', 'value' => 70, 'measured_at' => now()->subMinute()->toIso8601String()])->assertCreated();

        $this->postJson('/api/v1/auth/logout')->assertOk();
        $this->app['auth']->forgetGuards();
        $this->getJson('/api/v1/me')->assertUnauthorized();

        $this->postJson('/api/v1/auth/login', ['email' => 'alice@example.com', 'password' => 'Secret12345'])->assertOk();
        $this->getJson('/api/v1/body-measurements')->assertOk()->assertJsonCount(1, 'data');
    }

    public function test_registration_requires_consent_and_strong_password(): void
    {
        $this->postJson('/api/v1/auth/register', array_merge($this->reg, ['consent_health_data' => false]))->assertUnprocessable();
        $this->postJson('/api/v1/auth/register', array_merge($this->reg, ['password' => 'short', 'password_confirmation' => 'short']))->assertUnprocessable();
        $this->assertDatabaseCount('users', 0);
    }

    public function test_wrong_password_is_rejected_without_leaking_which_part_failed_and_is_throttled(): void
    {
        User::factory()->create(['email' => 'bob@example.com']);
        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/v1/auth/login', ['email' => 'bob@example.com', 'password' => 'nope'])
                ->assertUnprocessable()->assertJsonPath('errors.email.0', 'Adresse e-mail ou mot de passe incorrect.');
        }
        $this->postJson('/api/v1/auth/login', ['email' => 'bob@example.com', 'password' => 'password'])
            ->assertUnprocessable()->assertSee('Trop de tentatives');
    }

    public function test_errors_do_not_expose_internals(): void
    {
        config(['app.debug' => false]);
        $this->getJson('/api/v1/nonexistent')->assertNotFound()->assertDontSee('vendor');
    }

    public function test_api_responses_are_never_cacheable_and_carry_security_headers(): void
    {
        $r = $this->getJson('/api/v1/me');
        $this->assertStringContainsString('no-store', $r->headers->get('Cache-Control'));
        $r->assertHeader('X-Content-Type-Options', 'nosniff');
    }
}
