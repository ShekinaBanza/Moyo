<?php

return [
    'accepted' => 'Vous devez accepter ce champ.',
    'after_or_equal' => 'Le champ :attribute doit être une date postérieure ou égale à :date.',
    'array' => 'Le champ :attribute doit être une liste.',
    'before' => 'Le champ :attribute doit être une date antérieure à :date.',
    'before_or_equal' => 'Le champ :attribute doit être une date antérieure ou égale à :date.',
    'between' => [
        'numeric' => 'Le champ :attribute doit être compris entre :min et :max.',
        'string' => 'Le champ :attribute doit contenir entre :min et :max caractères.',
    ],
    'boolean' => 'Le champ :attribute doit être vrai ou faux.',
    'confirmed' => 'La confirmation du champ :attribute ne correspond pas.',
    'date' => "Le champ :attribute n'est pas une date valide.",
    'date_format' => 'Le champ :attribute ne respecte pas le format :format.',
    'email' => 'Le champ :attribute doit être une adresse e-mail valide.',
    'exists' => 'La valeur choisie pour :attribute est invalide.',
    'in' => 'La valeur choisie pour :attribute est invalide.',
    'integer' => 'Le champ :attribute doit être un nombre entier.',
    'max' => [
        'numeric' => 'Le champ :attribute ne peut pas dépasser :max.',
        'string' => 'Le champ :attribute ne peut pas dépasser :max caractères.',
        'array' => 'Le champ :attribute ne peut pas contenir plus de :max éléments.',
    ],
    'min' => [
        'numeric' => 'Le champ :attribute doit être au moins :min.',
        'string' => 'Le champ :attribute doit contenir au moins :min caractères.',
        'array' => 'Le champ :attribute doit contenir au moins :min éléments.',
    ],
    'numeric' => 'Le champ :attribute doit être un nombre.',
    'required' => 'Le champ :attribute est obligatoire.',
    'required_if' => 'Le champ :attribute est obligatoire.',
    'string' => 'Le champ :attribute doit être un texte.',
    'unique' => 'Cette valeur pour :attribute est déjà utilisée.',
    'password' => [
        'letters' => 'Le mot de passe doit contenir au moins une lettre.',
        'numbers' => 'Le mot de passe doit contenir au moins un chiffre.',
        'min' => 'Le mot de passe doit contenir au moins :min caractères.',
    ],
    'attributes' => [
        'name' => 'nom', 'email' => 'adresse e-mail', 'password' => 'mot de passe',
        'consent_health_data' => 'consentement', 'bedtime' => 'heure du coucher', 'wake_time' => 'heure du réveil',
        'intensity' => 'intensité', 'value' => 'valeur', 'measured_at' => 'date de mesure', 'eaten_at' => 'date du repas',
        'meal_type' => 'type de repas', 'symptom_type' => 'type de symptôme', 'occurred_at' => 'date du symptôme',
        'started_at' => "début de l'activité", 'activity_type' => "type d'activité", 'steps' => 'pas',
        'height_cm' => 'taille', 'confirmation' => 'confirmation',
    ],
];
