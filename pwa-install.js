(() => {
  const APP_NAME = "Control de Producción";
  const ACCENT = "#e91e63";
  const DISMISS_KEY = "pwa-install-dismissed-v1";
  const DISMISS_MS = 7 * 24 * 60 * 60 * 1000;
  let deferredPrompt = null;
  let banner = null;

  const isStandalone = () => {
    try {
      return window.matchMedia("(display-mode: standalone)").matches ||
        window.matchMedia("(display-mode: fullscreen)").matches ||
        window.navigator.standalone === true;
    } catch (_) {
      return false;
    }
  };

  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);

  const wasRecentlyDismissed = () => {
    try {
      const value = Number(localStorage.getItem(DISMISS_KEY) || 0);
      return value && (Date.now() - value) < DISMISS_MS;
    } catch (_) {
      return false;
    }
  };

  const rememberDismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch (_) {}
  };

  const removeBanner = () => {
    if (banner) {
      banner.remove();
      banner = null;
    }
  };

  const showBanner = ({ ios = false } = {}) => {
    if (banner || isStandalone() || wasRecentlyDismissed()) return;

    banner = document.createElement("div");
    banner.setAttribute("role", "dialog");
    banner.setAttribute("aria-label", "Instalar aplicación");
    banner.style.cssText = [
      "position:fixed",
      "left:14px",
      "right:14px",
      "bottom:14px",
      "z-index:2147483647",
      "display:flex",
      "align-items:center",
      "gap:12px",
      "padding:12px 14px",
      "border:1px solid rgba(255,255,255,.14)",
      "border-radius:14px",
      "background:rgba(15,15,18,.97)",
      "box-shadow:0 12px 35px rgba(0,0,0,.45)",
      "color:#fff",
      "font-family:Arial,sans-serif",
      "max-width:560px",
      "margin:0 auto"
    ].join(";");

    banner.innerHTML = `
      <div style="width:42px;height:42px;flex:0 0 42px;border-radius:10px;overflow:hidden;background:#111;display:grid;place-items:center;">
        <img src="assets/icon.svg" alt="" width="42" height="42" style="display:block;">
      </div>
      <div style="flex:1;min-width:0;">
        <div style="font-weight:800;font-size:14px;margin-bottom:2px;">Instalar ${APP_NAME}</div>
        <div style="font-size:12px;color:#c8c8c8;line-height:1.35;">
          ${ios
            ? "En iPhone/iPad: toca Compartir y luego “Añadir a pantalla de inicio”."
            : "Instálala para abrirla como una aplicación desde tu equipo o celular."}
        </div>
      </div>
      <button id="pwaInstallBtn" type="button"
        style="border:0;border-radius:9px;padding:9px 12px;background:${ACCENT};color:#fff;font-weight:800;cursor:pointer;white-space:nowrap;">
        ${ios ? "Cómo instalar" : "Instalar"}
      </button>
      <button id="pwaCloseBtn" type="button" aria-label="Cerrar"
        style="border:0;background:transparent;color:#aaa;font-size:20px;line-height:1;cursor:pointer;padding:4px;">×</button>
    `;

    document.body.appendChild(banner);

    banner.querySelector("#pwaCloseBtn").addEventListener("click", () => {
      rememberDismiss();
      removeBanner();
    });

    banner.querySelector("#pwaInstallBtn").addEventListener("click", async () => {
      if (ios) {
        alert("En Safari: pulsa Compartir → Añadir a pantalla de inicio.");
        return;
      }

      if (!deferredPrompt) {
        alert("La instalación todavía no está disponible en este navegador. Abre el menú del navegador y busca “Instalar aplicación” o “Añadir a pantalla de inicio”.");
        return;
      }

      const promptEvent = deferredPrompt;
      deferredPrompt = null;

      try {
        await promptEvent.prompt();
        await promptEvent.userChoice;
      } catch (error) {
        console.warn("No se pudo mostrar el aviso de instalación:", error);
      }

      removeBanner();
    });
  };

  window.addEventListener("beforeinstallprompt", (event) => {
    if (isStandalone()) return;
    event.preventDefault();
    deferredPrompt = event;
    showBanner();
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    removeBanner();
    try { localStorage.removeItem(DISMISS_KEY); } catch (_) {}
  });

  window.addEventListener("load", () => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("./service-worker.js", { scope: "./" })
        .catch((error) => console.warn("PWA service worker:", error));
    }

    if (isIOS && !isStandalone()) {
      window.setTimeout(() => showBanner({ ios: true }), 900);
    }
  });
})();