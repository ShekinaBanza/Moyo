<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    /** Reference data only: no demo users and no fake health records. */
    public function run(): void
    {
        $this->call(FoodCatalogSeeder::class);
        $this->call(ActivityCatalogSeeder::class);
        $this->call(ExerciseSeeder::class);
    }
}
