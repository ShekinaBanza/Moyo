<?php

namespace Tests\Unit;

use App\Services\EnergyCalculator;
use PHPUnit\Framework\TestCase;

class EnergyCalculatorTest extends TestCase
{
    public function test_gross_formula(): void
    {
        // MET 3.5 x 3.5 x 70 kg / 200 x 60 min
        $this->assertEqualsWithDelta(257.25, EnergyCalculator::grossKcal(3.5, 70, 60), 0.001);
    }

    public function test_net_is_gross_minus_resting_cost_of_same_duration(): void
    {
        $gross = EnergyCalculator::grossKcal(3.5, 70, 60);
        $rest = EnergyCalculator::grossKcal(1.0, 70, 60); // 1 MET = resting
        $this->assertEqualsWithDelta($gross - $rest, EnergyCalculator::netKcal(3.5, 70, 60), 0.001);
        $this->assertEqualsWithDelta(183.75, EnergyCalculator::netKcal(3.5, 70, 60), 0.001);
        $this->assertSame(0.0, EnergyCalculator::netKcal(0.8, 70, 60)); // never negative
    }

    public function test_mifflin_st_jeor(): void
    {
        $this->assertEqualsWithDelta(1648.75, EnergyCalculator::restingKcal('male', 30, 175, 70), 0.001);
        $this->assertEqualsWithDelta(1482.75, EnergyCalculator::restingKcal('female', 30, 175, 70), 0.001);
    }

    public function test_resting_rate_is_null_when_a_variable_is_missing_or_not_applicable(): void
    {
        $this->assertNull(EnergyCalculator::restingKcal(null, 30, 175, 70));
        $this->assertNull(EnergyCalculator::restingKcal('other', 30, 175, 70));
        $this->assertNull(EnergyCalculator::restingKcal('male', null, 175, 70));
        $this->assertNull(EnergyCalculator::restingKcal('male', 30, null, 70));
        $this->assertNull(EnergyCalculator::restingKcal('male', 30, 175, null));
        $this->assertNull(EnergyCalculator::restingKcal('male', 9, 140, 30)); // outside the formula's intended range
    }

    public function test_estimate_is_unavailable_not_zero_when_inputs_are_missing(): void
    {
        $noWeight = EnergyCalculator::activityEstimate(3.5, false, null, 30, null);
        $this->assertNull($noWeight['gross_kcal']);
        $this->assertSame('unavailable', $noWeight['quality']);
        $this->assertContains('poids', $noWeight['missing']);

        $noDuration = EnergyCalculator::activityEstimate(3.5, false, 70, null, null);
        $this->assertNull($noDuration['net_kcal']);
        $this->assertContains('durée', $noDuration['missing']);
    }

    public function test_custom_activity_needs_an_effort_and_uses_a_generic_met(): void
    {
        $none = EnergyCalculator::activityEstimate(null, true, 70, 30, null);
        $this->assertSame('unavailable', $none['quality']);

        $moderate = EnergyCalculator::activityEstimate(null, true, 70, 30, 5);
        $this->assertSame(4.0, $moderate['met']);
        $this->assertSame('low', $moderate['quality']);
        $this->assertNotEmpty($moderate['assumptions']);
    }

    public function test_catalogue_activity_is_good_quality_and_gross_and_net_are_separate_values(): void
    {
        $e = EnergyCalculator::activityEstimate(3.5, false, 70, 60, null);
        $this->assertSame('good', $e['quality']);
        $this->assertGreaterThan($e['net_kcal'], $e['gross_kcal']);
    }

    public function test_balance_status_thresholds(): void
    {
        $this->assertSame('close', EnergyCalculator::balanceStatus(50));
        $this->assertSame('close', EnergyCalculator::balanceStatus(-100));
        $this->assertSame('surplus', EnergyCalculator::balanceStatus(300));
        $this->assertSame('deficit', EnergyCalculator::balanceStatus(-300));
    }
}
