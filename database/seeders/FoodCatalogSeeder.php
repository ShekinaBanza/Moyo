<?php

namespace Database\Seeders;

use App\Models\FoodCatalogItem;
use Illuminate\Database\Seeder;

/**
 * Catalogue of foods commonly eaten in the DRC. Catalogue nutrition stays "unknown";
 * indicative per-portion kcal are offered to the user only as an explicit, optional ESTIMATE.
 */
class FoodCatalogSeeder extends Seeder
{
    /** Indicative kcal for a small / medium / large portion. Orders of magnitude only: ALWAYS shown as an estimate. */
    private const KCAL = [
        'foufou' => [200, 350, 550], 'chikwangue' => [150, 250, 400], 'manioc' => [150, 250, 400], 'riz' => [130, 230, 390],
        'mais' => [100, 200, 320], 'pain' => [120, 240, 360], 'banane-plantain' => [120, 200, 300], 'haricots' => [100, 180, 280],
        'poisson' => [100, 180, 280], 'poulet' => [150, 250, 400], 'boeuf' => [150, 260, 420], 'oeufs' => [75, 150, 225],
        'lait' => [60, 120, 200], 'feuilles-manioc' => [40, 80, 140], 'amarante' => [30, 60, 100], 'legumes' => [25, 50, 90],
        'mangue' => [60, 100, 170], 'papaye' => [40, 70, 120], 'ananas' => [40, 80, 130], 'avocat' => [120, 200, 320],
        'banane' => [50, 90, 130], 'huile-palme' => [100, 200, 350], 'sauce-arachide' => [150, 280, 450],
        'soda' => [100, 140, 200], 'jus' => [80, 130, 200],
    ];

    private const PORTIONS = ['small' => 'petite portion', 'medium' => 'portion moyenne', 'large' => 'grande portion'];

    public function run(): void
    {
        $items = [
            ['foufou', 'Foufou (ugali de manioc)', 'feculents', 'foufou'],
            ['chikwangue', 'Chikwangue (bâton de manioc)', 'feculents', 'chikwangue'],
            ['manioc', 'Manioc bouilli ou frit', 'feculents', 'foufou'],
            ['riz', 'Riz', 'feculents', 'riz'],
            ['mais', 'Maïs (épi ou farine)', 'feculents', 'mais'],
            ['pain', 'Pain', 'feculents', 'pain'],
            ['banane-plantain', 'Banane plantain', 'feculents', 'fruits'],
            ['haricots', 'Haricots', 'proteines', 'haricots'],
            ['poisson', 'Poisson (frais, fumé ou salé)', 'proteines', 'poisson'],
            ['poulet', 'Poulet', 'proteines', 'viande'],
            ['boeuf', 'Bœuf', 'proteines', 'viande'],
            ['oeufs', 'Œufs', 'proteines', 'oeufs'],
            ['lait', 'Lait', 'produits-laitiers', 'lait'],
            ['feuilles-manioc', 'Feuilles de manioc (pondu)', 'legumes', 'legumes'],
            ['amarante', "Amarante (lengalenga)", 'legumes', 'legumes'],
            ['legumes', 'Légumes (tomate, oignon, aubergine…)', 'legumes', 'legumes'],
            ['mangue', 'Mangue', 'fruits', 'fruits'],
            ['papaye', 'Papaye', 'fruits', 'fruits'],
            ['ananas', 'Ananas', 'fruits', 'fruits'],
            ['avocat', 'Avocat', 'fruits', 'fruits'],
            ['banane', 'Banane douce', 'fruits', 'fruits'],
            ['huile-palme', 'Huile (palme, arachide) et sauces', 'matieres-grasses', 'sauce'],
            ['sauce-arachide', "Sauce d'arachide (moambe, sauce graine)", 'matieres-grasses', 'sauce'],
            ['soda', 'Soda ou boisson sucrée', 'boissons', 'boisson'],
            ['jus', 'Jus de fruit sucré', 'boissons', 'boisson'],
            ['eau', 'Eau', 'boissons', 'boisson'],
            ['the-cafe', 'Thé ou café', 'boissons', 'boisson'],
        ];

        foreach ($items as [$slug, $name, $category, $image]) {
            FoodCatalogItem::updateOrCreate(['slug' => $slug], [
                'name' => $name,
                'category' => $category,
                'default_unit' => $category === 'boissons' ? 'ml' : 'portion',
                'portion_hints' => self::PORTIONS,
                'nutrition_status' => 'unknown',
                'image' => $image,
                'portion_kcal' => isset(self::KCAL[$slug]) ? array_combine(['small', 'medium', 'large'], self::KCAL[$slug]) : null,
                'portion_kcal_source' => isset(self::KCAL[$slug]) ? 'Ordre de grandeur indicatif (non vérifié pour votre recette ni votre portion)' : null,
            ]);
        }
    }
}
