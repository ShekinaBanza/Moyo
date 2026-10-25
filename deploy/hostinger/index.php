<?php

// Entry point for Hostinger when the document root CANNOT be pointed at Laravel's public/ folder.
// Place this file in ~/public_html/ (together with the CONTENT of public/), and the Laravel project OUTSIDE
// public_html, e.g. ~/moyo . Adjust $app below if the project folder has another name.
// Never copy app/, vendor/, .env, storage/ ... into public_html.

use Illuminate\Http\Request;

define('LARAVEL_START', microtime(true));

$app = dirname(__DIR__).'/moyo';

if (file_exists($maintenance = $app.'/storage/framework/maintenance.php')) {
    require $maintenance;
}

require $app.'/vendor/autoload.php';

/** @var \Illuminate\Foundation\Application $application */
$application = require_once $app.'/bootstrap/app.php';

// public files (Vite manifest, build/) live in public_html, not in the project folder
$application->usePublicPath(__DIR__);

$application->handleRequest(Request::capture());
