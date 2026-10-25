<?php

namespace Database\Seeders;

use App\Models\ActivityCatalogItem;
use Illuminate\Database\Seeder;

/**
 * MET values: indicative figures from the Compendium of Physical Activities (Ainsworth et al., 2011),
 * rounded to one decimal. They were NOT re-verified code by code against the source: see docs/ENERGY.md.
 * "custom" entries have no MET: it is derived from the declared effort (generic light/moderate/vigorous).
 */
class ActivityCatalogSeeder extends Seeder
{
    private const SRC = 'Compendium of Physical Activities (2011), valeur arrondie, non revérifiée';

    public function run(): void
    {
        $items = [
            // slug, name, category, activity_type, MET, icon
            ['marche-lente', 'Marche lente (≈ 3 km/h)', 'marche', 'walking', 2.8, 'walk'],
            ['marche-normale', 'Marche normale (≈ 5 km/h)', 'marche', 'walking', 3.5, 'walk'],
            ['marche-rapide', 'Marche rapide (≈ 6 km/h)', 'marche', 'walking', 4.3, 'walk'],
            ['marche-montee', 'Marche en montée', 'marche', 'walking', 6.0, 'hill'],
            ['deplacement-pied', 'Déplacements à pied', 'marche', 'walking', 3.5, 'walk'],
            ['escaliers', "Montée d'escaliers", 'marche', 'walking', 4.0, 'stairs'],
            ['course', 'Course à pied (≈ 8 km/h)', 'course', 'running', 8.3, 'run'],
            ['velo', 'Vélo (rythme tranquille)', 'velo', 'cycling', 4.0, 'bike'],
            ['danse', 'Danse', 'sport', 'other', 5.0, 'dance'],
            ['football', 'Football (amical)', 'sport', 'other', 7.0, 'ball'],
            ['travaux-menagers', 'Travaux ménagers', 'maison', 'housework', 3.3, 'home'],
            ['nettoyage', 'Nettoyage (sols, lessive)', 'maison', 'housework', 3.5, 'broom'],
            ['jardinage', 'Jardinage / champ', 'maison', 'other', 3.8, 'garden'],
            ['travail-physique', 'Travail physique', 'travail', 'other', 5.0, 'work'],
            ['seance-musculation', 'Séance de musculation', 'sport', 'other', 3.5, 'strength'],
            ['seance-abdominaux', 'Séance abdominaux et gainage', 'sport', 'other', 3.8, 'abs'],
            ['seance-mobilite', 'Séance de mobilité et étirements', 'sport', 'other', 2.3, 'stretch'],
            ['renforcement-general', 'Renforcement général (circuit)', 'sport', 'other', 5.0, 'circuit'],
            ['travail-assis', 'Activité professionnelle assise', 'travail', 'other', 1.3, 'desk'],
        ];
        foreach ($items as $i => [$slug, $name, $category, $type, $met, $icon]) {
            ActivityCatalogItem::updateOrCreate(['slug' => $slug], [
                'name' => $name, 'category' => $category, 'activity_type' => $type, 'met' => $met,
                'icon' => $icon, 'met_source' => self::SRC, 'sort' => $i, 'is_custom' => false,
            ]);
        }
        ActivityCatalogItem::updateOrCreate(['slug' => 'autre'], [
            'name' => 'Autre activité (personnalisée)', 'category' => 'autre', 'activity_type' => 'other', 'met' => null,
            'icon' => 'other', 'met_source' => 'MET générique selon l\'intensité déclarée (légère 2,5 / modérée 4,0 / intense 7,0)',
            'sort' => 99, 'is_custom' => true,
        ]);
    }
}
