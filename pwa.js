(() => {
  const appBase = new URL("./", document.currentScript?.src || location.href);

  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  const isInstalled = () =>
    window.matchMedia("(display-mode: standalone)").matches ||
    navigator.standalone === true;

  const supportsNotifications = () =>
    "Notification" in window &&
    typeof Notification.requestPermission === "function";

  let installEvent = null;
  let installButton;
  let message;
  let registration = null;
  const serviceWorkerReady = (async () => {
    if (
      !("serviceWorker" in navigator) ||
      !window.isSecureContext
    ) {
      return { registration: null };
    }

    try {
      const existing =
        await navigator.serviceWorker.getRegistration(appBase.href);

      if (!existing || existing.scope !== appBase.href) {
        await navigator.serviceWorker.register(
          new URL("service-worker.js", appBase).href
        );
      } else {
        existing.update().catch(() => {});
      }

      const active = await navigator.serviceWorker.ready;

      if (!navigator.serviceWorker.controller) {
        await new Promise((resolve) => {
          const onControllerChange = () => {
            navigator.serviceWorker.removeEventListener(
              "controllerchange",
              onControllerChange
            );
            resolve();
          };

          navigator.serviceWorker.addEventListener(
            "controllerchange",
            onControllerChange
          );

          if (navigator.serviceWorker.controller) {
            onControllerChange();
          }
        });
      }

      return { registration: active };
    } catch (error) {
      return { error };
    }
  })();

  window.nasaServiceWorkerReady = serviceWorkerReady;

  function updateInstallButton() {
    if (!installButton) return;

    installButton.hidden =
      isInstalled() || (!installEvent && !isIOS);

    installButton.textContent =
      installEvent ? "Install app" : "Install on iPhone";
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installEvent = event;
    updateInstallButton();
  });

  window.addEventListener("appinstalled", () => {
    installEvent = null;

    if (installButton) installButton.hidden = true;

    if (message) {
      message.textContent =
        "Installed! Open NASA Explorer from your home screen.";
    }
  });

  async function start() {
    if (document.getElementById("nasaPwaPanel")) return;

    const style = document.createElement("style");

    style.textContent = `
      #nasaPwaPanel {
        box-sizing: border-box;
        width: min(1120px, calc(100% - 32px));
        margin: 16px auto;
        padding: 18px;
        color: #eef5ff;
        background: #111a36;
        border: 1px solid #354564;
        border-radius: 16px;
        font: 15px/1.5 system-ui, sans-serif;
      }

      #nasaPwaPanel strong {
        display: block;
        margin-bottom: 10px;
        font-size: 17px;
      }

      #nasaPwaPanel .pwa-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }

      #nasaPwaPanel button {
        min-height: 44px;
        padding: 10px 18px;
        border: 1px solid #7dd3fc;
        border-radius: 24px;
        background: #7dd3fc;
        color: #071122;
        font: 600 15px system-ui, sans-serif;
        cursor: pointer;
      }

      #nasaPwaPanel button:disabled {
        opacity: .6;
        cursor: default;
      }

      #nasaPwaPanel button:focus-visible {
        outline: 3px solid white;
        outline-offset: 3px;
      }

      #nasaPwaPanel p {
        margin: 12px 0 0;
        color: #c9d6ee;
      }

      #nasaPwaOffline {
        padding: 10px;
        border-radius: 8px;
        background: #513720;
        color: #fff0d1 !important;
      }

      #nasaPwaPanel [hidden] {
        display: none !important;
      }
    `;

    document.head.append(style);

    const panel = document.createElement("section");
    panel.id = "nasaPwaPanel";

    panel.setAttribute(
      "aria-label",
      "App installation and notifications"
    );

    panel.innerHTML = `
      <strong>Take space with you</strong>

      <div class="pwa-actions">
        <button id="nasaPwaInstall" type="button" hidden>
          Install app
        </button>

        <button id="nasaPwaNotify" type="button" disabled>
          Enable notifications
        </button>
      </div>

      <p id="nasaPwaMessage" role="status">
        Setting up offline access...
      </p>

      <p id="nasaPwaOffline" role="status" hidden>
        You're offline. Only previously loaded dates and images are available.
      </p>
    `;

    const header = document.querySelector("header");

    if (header) {
      header.insertAdjacentElement("afterend", panel);
    } else {
      document.body.prepend(panel);
    }

    installButton = document.getElementById("nasaPwaInstall");

    const notifyButton =
      document.getElementById("nasaPwaNotify");

    const offline =
      document.getElementById("nasaPwaOffline");

    message = document.getElementById("nasaPwaMessage");

    function updateConnection() {
      offline.hidden = navigator.onLine;
    }

    window.addEventListener("online", updateConnection);
    window.addEventListener("offline", updateConnection);

    updateConnection();
    updateInstallButton();

    installButton.addEventListener("click", async () => {
      if (!installEvent) {
        message.textContent =
          "On your iPhone, tap Share, choose Add to Home Screen, then tap Add. Open the new home screen icon afterward.";
        return;
      }

      const promptEvent = installEvent;
      installEvent = null;
      updateInstallButton();

      try {
        await promptEvent.prompt();

        const choice = await promptEvent.userChoice;

        message.textContent = choice.outcome === "accepted"
          ? "Installed! Open NASA Explorer from your home screen or app launcher."
          : "Installation dismissed. You can install later from your browser's menu.";
      } catch (error) {
        console.error("Installation failed:", error);

        message.textContent =
          "Could not open installation. Reload and try again.";
      }
    });

    notifyButton.addEventListener("click", async () => {
      if (!registration || !supportsNotifications()) return;

      notifyButton.disabled = true;

      try {
        const permission = Notification.permission === "granted"
          ? "granted"
          : await Notification.requestPermission();

        if (permission !== "granted") {
          message.textContent = permission === "denied"
            ? "Notifications are blocked. Change this site's notification settings and reload to try again."
            : "Permission was not granted. Tap Enable notifications to try again.";

          return;
        }

        await registration.showNotification(
          "NASA Space Explorer",
          {
            body: "Your space explorer is ready. This is your demo notification!",
            icon: new URL("icons/icon-192.png", appBase).href,
            tag: "nasa-explorer-demo"
          }
        );

        notifyButton.textContent = "Send test notification";

        message.textContent =
          "Test notification sent! Check your device's notifications.";
      } catch (error) {
        console.error("Notification failed:", error);

        message.textContent =
          "Could not display the notification. Check your browser and device notification settings.";
      } finally {
        notifyButton.disabled =
          Notification.permission === "denied";
      }
    });

    if (
      !("serviceWorker" in navigator) ||
      !window.isSecureContext
    ) {
      message.textContent =
        "Offline access needs a secure HTTPS connection.";
      return;
    }

    try {
      const setup = await serviceWorkerReady;

      if (setup.error) throw setup.error;

      registration = setup.registration;

      if (
        !supportsNotifications() ||
        typeof registration.showNotification !== "function"
      ) {
        notifyButton.textContent = "Notifications unavailable";

        message.textContent = isIOS && !isInstalled()
          ? "Add this app to your Home Screen and open it there to enable notifications."
          : "Offline access is ready. Notifications aren't supported in this browser.";

        return;
      }

      const blocked = Notification.permission === "denied";

      notifyButton.disabled = blocked;

      notifyButton.textContent =
        Notification.permission === "granted"
          ? "Send test notification"
          : "Enable notifications";

      message.textContent = blocked
        ? "Notifications are blocked. Update this site's notification settings and reload to try again."
        : "Offline access is ready. Reload once online to save your gallery.";
    } catch (error) {
      console.error("Service worker registration failed:", error);

      message.textContent =
        "Offline setup failed. Reload while online to try again.";
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, {
      once: true
    });
  } else {
    start();
  }
})();