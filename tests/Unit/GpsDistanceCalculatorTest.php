<?php

namespace Tests\Unit;

use App\Services\GpsDistanceCalculator as G;
use PHPUnit\Framework\TestCase;

class GpsDistanceCalculatorTest extends TestCase
{
    private function p(float $lat, float $lng, int $t, ?float $acc = 5.0, int $seg = 0): array
    {
        return ['lat' => $lat, 'lng' => $lng, 'accuracy' => $acc, 'time' => $t, 'segment' => $seg];
    }

    public function test_haversine_known_distance(): void
    {
        // 0.01 degree of latitude = about 1112 m
        $this->assertEqualsWithDelta(1111.95, G::haversine(0.0, 0.0, 0.01, 0.0), 1.0);
        $this->assertSame(0.0, G::haversine(-4.3, 15.3, -4.3, 15.3));
    }

    public function test_distance_follows_the_path_not_first_to_last(): void
    {
        // Go 0.01 deg north, then come back: first == last but ~2.2 km were walked.
        $r = G::compute([$this->p(0, 0, 0), $this->p(0.005, 0, 400 / 4), $this->p(0.01, 0, 200), $this->p(0.005, 0, 300), $this->p(0, 0, 400)]);
        $this->assertEqualsWithDelta(2223.9, $r['distance_m'], 5);
    }

    public function test_inaccurate_points_are_rejected_and_counted(): void
    {
        $r = G::compute([$this->p(0, 0, 0), $this->p(0.001, 0, 60, 200.0), $this->p(0.002, 0, 120)]);
        $this->assertSame(1, $r['rejected']['accuracy']);
        $this->assertEqualsWithDelta(222.4, $r['distance_m'], 2);
    }

    public function test_teleport_jumps_are_rejected(): void
    {
        $r = G::compute([$this->p(0, 0, 0), $this->p(0.5, 0.5, 5), $this->p(0.0005, 0, 60)]);
        $this->assertSame(1, $r['rejected']['speed']);
        $this->assertLessThan(100, $r['distance_m']);
    }

    public function test_jitter_while_standing_is_ignored(): void
    {
        $pts = [];
        for ($i = 0; $i < 20; $i++) {
            $pts[] = $this->p(0.00001 * ($i % 2), 0, $i * 5); // ~1 m wobble
        }
        $this->assertSame(0.0, G::compute($pts)['distance_m']);
    }

    public function test_nothing_is_counted_across_a_pause_segment(): void
    {
        $r = G::compute([$this->p(0, 0, 0, 5, 0), $this->p(0.001, 0, 60, 5, 0), $this->p(0.05, 0, 1000, 5, 1), $this->p(0.051, 0, 1060, 5, 1)]);
        $this->assertEqualsWithDelta(222.4, $r['distance_m'], 3); // 111 + 111, the 5 km jump between segments is ignored
    }

    public function test_signal_gap_is_detected_and_not_counted(): void
    {
        $r = G::compute([$this->p(0, 0, 0), $this->p(0.001, 0, 60), $this->p(0.01, 0, 60 + 600), $this->p(0.011, 0, 720)]);
        $this->assertSame(1, $r['gaps']);
        $this->assertEqualsWithDelta(222.4, $r['distance_m'], 3);
    }

    public function test_pace_is_only_given_when_it_can_be_computed_reliably(): void
    {
        $this->assertNull(G::compute([$this->p(0, 0, 0), $this->p(0.0005, 0, 30)])['avg_pace_s_per_km']);
        $r = G::compute([$this->p(0, 0, 0), $this->p(0.005, 0, 120), $this->p(0.01, 0, 240)]);
        $this->assertEqualsWithDelta(216, $r['avg_pace_s_per_km'], 3); // 240 s for 1.11 km
    }

    public function test_empty_and_single_point(): void
    {
        $this->assertSame(0.0, G::compute([])['distance_m']);
        $this->assertSame(0.0, G::compute([$this->p(1, 1, 0)])['distance_m']);
    }
}
