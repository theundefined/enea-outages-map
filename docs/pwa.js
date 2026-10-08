// "Add to home screen" button. Chrome/Edge/Samsung Internet on Android fire
// beforeinstallprompt; other Android browsers (e.g. Firefox) only get instructions.
(function () {
    const button = document.getElementById('install-button');
    if (!button) return;

    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    const isAndroid = /Android/i.test(navigator.userAgent);
    if (isStandalone) return;

    let deferredPrompt = null;

    window.addEventListener('beforeinstallprompt', (event) => {
        event.preventDefault();
        deferredPrompt = event;
        button.hidden = false;
    });

    window.addEventListener('appinstalled', () => {
        deferredPrompt = null;
        button.hidden = true;
    });

    // Browsers without beforeinstallprompt support still allow installing from the menu.
    if (isAndroid && !('onbeforeinstallprompt' in window)) {
        button.hidden = false;
    }

    button.addEventListener('click', async () => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            deferredPrompt = null;
            if (outcome === 'accepted') button.hidden = true;
            return;
        }
        alert('Aby dodać aplikację, otwórz menu przeglądarki (⋮) i wybierz „Dodaj do ekranu głównego” lub „Zainstaluj”.');
    });
})();
