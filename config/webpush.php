<?php

return [
    // Generate once with: php artisan webpush:vapid  (then copy the two values into .env on the server)
    'public_key' => env('VAPID_PUBLIC_KEY'),
    'private_key' => env('VAPID_PRIVATE_KEY'),
    'subject' => env('VAPID_SUBJECT', 'mailto:'.env('MAIL_FROM_ADDRESS', 'admin@example.com')),
];
