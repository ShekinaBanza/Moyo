<?php

namespace Tests\Feature;

use App\Models\ActivityCatalogItem;
use App\Models\GpsTrack;
use App\Models\HealthProfile;
use App\Models\User;
use App\Models\UserNotification;
use App\Services\GpsDistanceCalculator;
use App\Services\NotificationScheduler;
use Database\Seeders\ActivityCatalogSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class GpsAndNotificationsTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->user = User::factory()->create();
        Sanctum::actingAs($this->user);
    }

    private function consent(bool $granted = true): void
    {
        $this->postJson('/api/v1/consents', ['purpose' => 'gps_tracking', 'granted' => $granted])->assertCreated();
    }

    private function start(): int
    {
        return $this->postJson('/api/v1/tracks', ['started_at' => now()->subMinutes(30)->toIso8601String()])->assertCreated()->json('data.id');
    }

    private function pts(int $n, float $startLat = 0.0, int $segment = 0, int $offsetSec = 0): array
    {
        $base = now()->subMinutes(25)->addSeconds($offsetSec);
        $out = [];
        for ($i = 0; $i < $n; $i++) {
            $out[] = ['lat' => $startLat + $i * 0.0005, 'lng' => 0.0, 'accuracy' => 6, 'captured_at' => $base->copy()->addSeconds($i * 30)->toIso8601String(), 'segment' => $segment];
        }

        return $out;
    }

    // ---------------- GPS ----------------

    public function test_a_track_cannot_start_without_explicit_consent(): void
    {
        $this->postJson('/api/v1/tracks', [])->assertForbidden()->assertJsonPath('code', 'gps_consent_required');
        $this->consent(false);
        $this->postJson('/api/v1/tracks', [])->assertForbidden();
        $this->consent(true);
        $this->postJson('/api/v1/tracks', [])->assertCreated();
    }

    public function test_full_lifecycle_distance_comes_from_received_points(): void
    {
        $this->consent();
        $id = $this->start();
        $points = $this->pts(5); // 4 steps x ~55.6 m
        $this->postJson("/api/v1/tracks/$id/points", ['points' => $points])->assertOk()->assertJsonPath('result.accepted', 5);
        $r = $this->postJson("/api/v1/tracks/$id/finish")->assertOk()->json('data');

        $this->assertSame('finished', $r['status']);
        $expected = (int) round(4 * GpsDistanceCalculator::haversine(0, 0, 0.0005, 0));
        $this->assertSame($expected, $r['distance_m']);
        $this->assertSame(120, $r['duration_seconds']);
        $this->assertNotNull($r['ended_at']);
        $this->postJson("/api/v1/tracks/$id/finish")->assertStatus(409);
    }

    public function test_resending_points_does_not_duplicate_or_change_the_distance(): void
    {
        $this->consent();
        $id = $this->start();
        $points = $this->pts(4);
        $first = $this->postJson("/api/v1/tracks/$id/points", ['points' => $points])->json('data.distance_m');
        $again = $this->postJson("/api/v1/tracks/$id/points", ['points' => $points])->assertOk();
        $again->assertJsonPath('result.accepted', 0)->assertJsonPath('result.duplicates', 4);
        $this->assertSame($first, $again->json('data.distance_m'));
        $this->assertSame(4, GpsTrack::find($id)->points()->count());
    }

    public function test_bad_points_are_rejected_by_validation_and_by_the_filters(): void
    {
        $this->consent();
        $id = $this->start();
        $this->postJson("/api/v1/tracks/$id/points", ['points' => [['lat' => 120, 'lng' => 0, 'captured_at' => now()->toIso8601String()]]])->assertUnprocessable();
        $this->postJson("/api/v1/tracks/$id/points", ['points' => []])->assertUnprocessable();

        $pts = $this->pts(3);
        $pts[1]['accuracy'] = 400; // far too imprecise
        $r = $this->postJson("/api/v1/tracks/$id/points", ['points' => $pts])->assertOk()->json('data');
        $this->assertSame(1, $r['rejected_points']);
    }

    public function test_pause_resume_never_counts_distance_across_the_pause(): void
    {
        $this->consent();
        $id = $this->start();
        $this->postJson("/api/v1/tracks/$id/points", ['points' => $this->pts(3)])->assertOk();
        $this->postJson("/api/v1/tracks/$id/pause")->assertOk()->assertJsonPath('data.status', 'paused');
        $this->postJson("/api/v1/tracks/$id/points", ['points' => $this->pts(1, 0.1, 0, 400)])->assertStatus(409);
        $this->postJson("/api/v1/tracks/$id/pause")->assertStatus(409);
        $this->postJson("/api/v1/tracks/$id/resume")->assertOk()->assertJsonPath('data.current_segment', 1);
        $this->postJson("/api/v1/tracks/$id/points", ['points' => $this->pts(3, 0.1, 1, 400)])->assertOk();
        $d = $this->postJson("/api/v1/tracks/$id/finish")->json('data.distance_m');
        $this->assertEqualsWithDelta(4 * 55.6, $d, 3); // 2 steps + 2 steps; the 11 km between segments is ignored
    }

    public function test_interrupted_and_stale_tracks_are_distinguished_from_finished(): void
    {
        $this->consent();
        $id = $this->start();
        $this->postJson("/api/v1/tracks/$id/points", ['points' => $this->pts(2)])->assertOk();
        $this->postJson("/api/v1/tracks/$id/finish", ['interrupted' => true, 'reason' => 'permission_lost'])->assertOk()
            ->assertJsonPath('data.status', 'interrupted')->assertJsonPath('data.end_reason', 'permission_lost');

        // a track left open for hours (page closed / phone off) is closed lazily as interrupted
        $old = new GpsTrack(['started_at' => now()->subHours(5), 'status' => 'recording']);
        $old->user_id = $this->user->id;
        $old->save();
        $this->getJson('/api/v1/tracks')->assertOk();
        $this->assertSame('interrupted', $old->fresh()->status);
        $this->assertSame('stale', $old->fresh()->end_reason);
    }

    public function test_only_one_open_track_at_a_time(): void
    {
        $this->consent();
        $this->postJson('/api/v1/tracks', ['started_at' => now()->toIso8601String()])->assertCreated();
        $this->postJson('/api/v1/tracks', ['started_at' => now()->toIso8601String()])->assertStatus(409)->assertJsonPath('code', 'track_already_open');
    }

    public function test_track_creation_is_idempotent_with_client_id(): void
    {
        $this->consent();
        $a = $this->postJson('/api/v1/tracks', ['client_id' => 'trk-1'])->assertCreated()->json('data.id');
        $this->postJson('/api/v1/tracks', ['client_id' => 'trk-1'])->assertOk()->assertJsonPath('duplicate', true)->assertJsonPath('data.id', $a);
    }

    public function test_deleting_a_track_removes_its_points_and_unlinks_activities(): void
    {
        $this->seed(ActivityCatalogSeeder::class);
        $this->consent();
        $id = $this->start();
        $this->postJson("/api/v1/tracks/$id/points", ['points' => $this->pts(4)])->assertOk();
        $this->postJson("/api/v1/tracks/$id/finish")->assertOk();
        $act = $this->postJson('/api/v1/activity-entries', ['catalog_id' => ActivityCatalogItem::where('slug', 'marche-normale')->value('id'), 'started_at' => now()->subHour()->toIso8601String(), 'track_id' => $id])->assertCreated()->json('data');

        $this->assertSame('gps', $act['distance_source']);
        $this->assertEquals(round($this->getJson("/api/v1/tracks/$id")->json('data.distance_m') / 1000, 2), $act['distance_km']);
        $this->assertGreaterThan(0, $act['duration_minutes']);

        $this->deleteJson("/api/v1/tracks/$id")->assertOk();
        $this->assertDatabaseCount('gps_track_points', 0);
        $this->assertNull(\App\Models\ActivityEntry::find($act['id'])->track_id);
        $this->getJson("/api/v1/tracks/$id")->assertNotFound();
    }

    public function test_cannot_link_an_unfinished_track_or_mix_distance_sources(): void
    {
        $this->seed(ActivityCatalogSeeder::class);
        $this->consent();
        $id = $this->start();
        $cat = ActivityCatalogItem::where('slug', 'marche-normale')->value('id');
        $base = ['catalog_id' => $cat, 'started_at' => now()->toIso8601String(), 'track_id' => $id];
        $this->postJson('/api/v1/activity-entries', $base)->assertUnprocessable(); // still recording
        $this->postJson("/api/v1/tracks/$id/points", ['points' => $this->pts(3)]);
        $this->postJson("/api/v1/tracks/$id/finish");
        $this->postJson('/api/v1/activity-entries', $base + ['distance_km' => 5, 'distance_source' => 'watch'])->assertUnprocessable();
    }

    public function test_user_can_delete_the_whole_history(): void
    {
        $this->consent();
        $id = $this->start();
        $this->postJson("/api/v1/tracks/$id/points", ['points' => $this->pts(3)]);
        $this->postJson("/api/v1/tracks/$id/finish");
        $this->deleteJson('/api/v1/tracks')->assertOk()->assertJsonPath('deleted', 1);
        $this->assertDatabaseCount('gps_tracks', 0);
        $this->assertDatabaseCount('gps_track_points', 0);
    }

    public function test_tracks_of_another_user_are_inaccessible(): void
    {
        $this->consent();
        $id = $this->start();
        $this->postJson("/api/v1/tracks/$id/points", ['points' => $this->pts(3)]);

        $b = User::factory()->create();
        Sanctum::actingAs($b);
        $this->getJson('/api/v1/tracks')->assertOk()->assertJsonCount(0, 'data');
        $this->getJson("/api/v1/tracks/$id")->assertNotFound();
        $this->postJson("/api/v1/tracks/$id/points", ['points' => $this->pts(2)])->assertNotFound();
        $this->postJson("/api/v1/tracks/$id/pause")->assertNotFound();
        $this->postJson("/api/v1/tracks/$id/finish")->assertNotFound();
        $this->deleteJson("/api/v1/tracks/$id")->assertNotFound();
        $this->deleteJson('/api/v1/tracks')->assertOk()->assertJsonPath('deleted', 0);
        $this->assertDatabaseCount('gps_tracks', 1);

        // B cannot attach A's track to B's activity either
        $this->seed(ActivityCatalogSeeder::class);
        $this->postJson('/api/v1/activity-entries', ['catalog_id' => ActivityCatalogItem::first()->id, 'started_at' => now()->toIso8601String(), 'track_id' => $id])->assertUnprocessable();
    }

    public function test_gps_routes_require_authentication(): void
    {
        $this->app['auth']->forgetGuards();
        $this->refreshApplication();
        $this->getJson('/api/v1/tracks')->assertUnauthorized();
        $this->postJson('/api/v1/tracks')->assertUnauthorized();
    }

    // ---------------- Notifications ----------------

    private function enable(string $kind, string $time, array $extra = []): void
    {
        HealthProfile::unguarded(fn () => HealthProfile::updateOrCreate(['user_id' => $this->user->id], ['timezone' => 'Africa/Kinshasa'])); // UTC+1, no DST
        $this->patchJson('/api/v1/notification-preferences', ['preferences' => [['kind' => $kind, 'enabled' => true, 'time_of_day' => $time] + $extra]])->assertOk();
    }

    public function test_preferences_default_to_everything_off_and_can_be_changed_and_disabled(): void
    {
        $p = $this->getJson('/api/v1/notification-preferences')->assertOk()->json('data');
        $this->assertTrue($p['enabled']);
        $this->assertCount(count(NotificationScheduler::KINDS), $p['preferences']);
        $this->assertSame([], array_filter($p['preferences'], fn ($x) => $x['enabled']));
        $this->assertFalse($p['push']['server_configured']);

        $this->enable('lunch', '12:45');
        $lunch = collect($this->getJson('/api/v1/notification-preferences')->json('data.preferences'))->firstWhere('kind', 'lunch');
        $this->assertTrue($lunch['enabled']);
        $this->assertSame('12:45', $lunch['time_of_day']);

        $this->patchJson('/api/v1/notification-preferences', ['preferences' => [['kind' => 'lunch', 'enabled' => false]]])->assertOk();
        $this->patchJson('/api/v1/notification-preferences', ['preferences' => [['kind' => 'nonsense', 'enabled' => true]]])->assertUnprocessable();
        $this->patchJson('/api/v1/notification-preferences', ['timezone' => 'Mars/Olympus'])->assertUnprocessable();
    }

    public function test_reminder_is_created_once_in_the_users_timezone_and_within_its_window(): void
    {
        $this->enable('breakfast', '08:00');
        $s = app(NotificationScheduler::class);

        // 06:30 UTC = 07:30 in Kinshasa: not yet due
        $this->assertSame(0, $s->generateFor($this->user->fresh(), Carbon::parse('2026-10-20 06:30:00', 'UTC')));
        // 07:30 UTC = 08:30 local: due
        $this->assertSame(1, $s->generateFor($this->user->fresh(), Carbon::parse('2026-10-20 07:30:00', 'UTC')));
        // same day again: no duplicate
        $this->assertSame(0, $s->generateFor($this->user->fresh(), Carbon::parse('2026-10-20 08:00:00', 'UTC')));
        // far too late (window of 3 h passed) on another day: skipped, no stale pile-up
        $this->assertSame(0, $s->generateFor($this->user->fresh(), Carbon::parse('2026-10-21 12:00:00', 'UTC')));
        $this->assertSame(1, UserNotification::count());
        $this->assertSame('Petit-déjeuner', UserNotification::first()->title);
    }

    public function test_no_reminder_when_the_meal_is_already_logged_or_notifications_are_off(): void
    {
        $this->enable('lunch', '13:00');
        $this->postJson('/api/v1/food-entries', ['name' => 'Riz', 'meal_type' => 'lunch', 'eaten_at' => '2026-10-20T11:30:00Z'])->assertCreated();
        $s = app(NotificationScheduler::class);
        $now = Carbon::parse('2026-10-20 13:00:00', 'UTC'); // 14:00 local
        $this->assertSame(0, $s->generateFor($this->user->fresh(), $now));

        $this->enable('dinner', '19:00');
        $this->patchJson('/api/v1/notification-preferences', ['enabled' => false])->assertOk();
        $this->assertSame(0, $s->generateFor($this->user->fresh(), Carbon::parse('2026-10-20 19:30:00', 'UTC')));
    }

    public function test_weekly_and_weekday_frequencies(): void
    {
        $this->enable('weekly_trends', '18:00', ['frequency' => 'weekly', 'weekday' => 0]); // Sunday
        $s = app(NotificationScheduler::class);
        $this->assertSame(0, $s->generateFor($this->user->fresh(), Carbon::parse('2026-10-20 17:30:00', 'UTC'))); // Tuesday
        $this->assertSame(1, $s->generateFor($this->user->fresh(), Carbon::parse('2026-10-25 17:30:00', 'UTC'))); // Sunday 18:30 local
    }

    public function test_list_marks_read_and_counts_unread_and_is_private(): void
    {
        $s = app(NotificationScheduler::class);
        $n = $s->create($this->user, 'lunch', 'k1');
        $s->create($this->user, 'dinner', 'k2');
        $this->assertNull($s->create($this->user, 'dinner', 'k2')); // duplicate

        $this->getJson('/api/v1/notifications')->assertOk()->assertJsonPath('unread', 2)->assertJsonCount(2, 'data');
        $this->postJson("/api/v1/notifications/{$n->id}/read")->assertOk();
        $this->getJson('/api/v1/notifications/unread-count')->assertJsonPath('unread', 1);
        $this->postJson('/api/v1/notifications/read-all')->assertOk();
        $this->getJson('/api/v1/notifications/unread-count')->assertJsonPath('unread', 0);

        Sanctum::actingAs(User::factory()->create());
        $this->getJson('/api/v1/notifications')->assertJsonCount(0, 'data');
        $this->postJson("/api/v1/notifications/{$n->id}/read")->assertNotFound();
        $this->deleteJson("/api/v1/notifications/{$n->id}")->assertNotFound();
    }

    public function test_push_is_never_reported_as_sent_when_the_server_is_not_configured(): void
    {
        config(['webpush.public_key' => null, 'webpush.private_key' => null]);
        $this->postJson('/api/v1/push-subscriptions', ['endpoint' => 'https://push.example.test/abc', 'keys' => ['p256dh' => 'x', 'auth' => 'y']])->assertStatus(503)->assertJsonPath('code', 'push_not_configured');
        $this->assertDatabaseCount('push_subscriptions', 0);
        $this->postJson('/api/v1/push-subscriptions/test')->assertOk()->assertJsonPath('status', 'not_configured');
        $this->assertNotSame('sent', app(NotificationScheduler::class)->create($this->user, 'lunch', 'z')->push_status);
    }

    public function test_push_subscription_requires_valid_payload_and_is_private_when_configured(): void
    {
        config(['webpush.public_key' => 'pub', 'webpush.private_key' => 'priv']);
        $this->postJson('/api/v1/push-subscriptions', ['endpoint' => 'not-a-url'])->assertUnprocessable();
        $this->postJson('/api/v1/push-subscriptions', ['endpoint' => 'https://push.example.test/abc', 'keys' => ['p256dh' => 'x', 'auth' => 'y']])->assertCreated();
        $this->postJson('/api/v1/push-subscriptions', ['endpoint' => 'https://push.example.test/abc', 'keys' => ['p256dh' => 'x', 'auth' => 'y']])->assertCreated();
        $this->assertDatabaseCount('push_subscriptions', 1); // same endpoint: no duplicate

        Sanctum::actingAs(User::factory()->create());
        $this->deleteJson('/api/v1/push-subscriptions', ['endpoint' => 'https://push.example.test/abc'])->assertOk();
        $this->assertDatabaseCount('push_subscriptions', 1); // B cannot remove A's subscription
    }

    public function test_open_track_triggers_a_check_reminder_only_when_enabled_and_silent(): void
    {
        $this->consent();
        $id = $this->start();
        $s = app(NotificationScheduler::class);
        $this->assertSame(0, $s->generateFor($this->user->fresh())); // preference off
        $this->enable('track_check', '12:00');
        $this->assertSame(1, $s->generateFor($this->user->fresh())); // track started 30 min ago, no point yet
        $this->assertSame(0, $s->generateFor($this->user->fresh())); // deduplicated
        $this->assertNotNull(UserNotification::where('dedupe_key', "track_check:$id")->first());
    }
}
