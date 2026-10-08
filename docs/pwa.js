// "Add as app" support. Chrome/Edge/Samsung Internet fire beforeinstallprompt and get the
// native install dialog; elsewhere (or before the event arrives) the button shows instructions.
(function () {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js');
    }

    const button = document.getElementById('install-button');
    if (!button) return;

    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
        || window.navigator.standalone === true;
    if (isStandalone) return;

    let deferredPrompt = null;

    if (/Android/i.test(navigator.userAgent)) {
        button.hidden = false;
    }

    window.addEventListener('beforeinstallprompt', (event) => {
        event.preventDefault();
        deferredPrompt = event;
        button.hidden = false;
    });

    window.addEventListener('appinstalled', () => {
        deferredPrompt = null;
        button.hidden = true;
    });

    button.addEventListener('click', async () => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            deferredPrompt = null;
            if (outcome === 'accepted') button.hidden = true;
            return;
        }
        alert('Aby dodać aplikację, otwórz menu przeglądarki (⋮) i wybierz „Zainstaluj aplikację” lub „Dodaj do ekranu głównego”.');
    });
})();
