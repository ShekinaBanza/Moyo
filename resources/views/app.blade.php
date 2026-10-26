<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <title>Moyo — compagnon santé et habitudes</title>
    <meta name="description" content="Suivez votre sommeil, votre alimentation, votre activité et vos symptômes. Fonctionne avec ou sans montre connectée.">
    <meta name="theme-color" content="#0f766e">
    <script>
        try {
            var t = localStorage.getItem('moyo-theme');
            var dark = t === 'dark' || ((t === null || t === 'system') && window.matchMedia('(prefers-color-scheme: dark)').matches);
            if (dark) { document.documentElement.classList.add('dark'); }
        } catch (e) {}
    </script>
    <link rel="manifest" href="/manifest.webmanifest">
    <link rel="icon" type="image/svg+xml" href="/icons/icon.svg">
    <link rel="apple-touch-icon" href="/icons/icon-192.png">
    @viteReactRefresh
    @vite(['resources/css/app.css', 'resources/js/app.tsx'])
</head>
<body>
    <div id="root"></div>
    <noscript>Moyo nécessite JavaScript pour fonctionner.</noscript>
</body>
</html>
