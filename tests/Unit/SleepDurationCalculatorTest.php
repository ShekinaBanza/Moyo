<?php

namespace Tests\Unit;

use App\Services\SleepDurationCalculator;
use Carbon\Carbon;
use InvalidArgumentException;
use PHPUnit\Framework\TestCase;

class SleepDurationCalculatorTest extends TestCase
{
    public function test_crossing_midnight(): void
    {
        $r = (new SleepDurationCalculator)->calculate(Carbon::parse('2026-10-24 23:00 UTC'), Carbon::parse('2026-10-25 07:00 UTC'));
        $this->assertSame(['time_in_bed_minutes' => 480, 'sleep_minutes' => 480], $r);
    }

    public function test_time_in_bed_differs_from_sleep_when_onset_and_awakenings_known(): void
    {
        $r = (new SleepDurationCalculator)->calculate(Carbon::parse('2026-10-24 22:00 UTC'), Carbon::parse('2026-10-25 06:00 UTC'), Carbon::parse('2026-10-24 22:45 UTC'), 45);
        $this->assertSame(480, $r['time_in_bed_minutes']);
        $this->assertSame(390, $r['sleep_minutes']);
    }

    public function test_invalid_inputs(): void
    {
        $c = new SleepDurationCalculator;
        $this->expectException(InvalidArgumentException::class);
        $c->calculate(Carbon::parse('2026-10-25 07:00 UTC'), Carbon::parse('2026-10-25 06:00 UTC'));
    }

    public function test_onset_outside_window_is_invalid(): void
    {
        $this->expectException(InvalidArgumentException::class);
        (new SleepDurationCalculator)->calculate(Carbon::parse('2026-10-24 22:00 UTC'), Carbon::parse('2026-10-25 06:00 UTC'), Carbon::parse('2026-10-24 21:00 UTC'));
    }
}
