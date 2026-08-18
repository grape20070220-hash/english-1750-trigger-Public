"use client";

import { useEffect } from "react";

const BUILD_ID = "2026-08-19-api-budget-v7";
const CACHE_NAME = "eigoloop-shell-v7";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

async function syncPushSubscription(registration: ServiceWorkerRegistration) {
  if (!("Notification" in window) || Notification.permission !== "granted" || !("PushManager" in window)) return;
  try {
    const meResponse = await fetch("/api/me", { cache: "no-store" });
    if (!meResponse.ok) return;
    const me = await meResponse.json();
    let subscription = await registration.pushManager.getSubscription();

    if (!me?.account?.reminder_enabled) {
      if (subscription) {
        await fetch("/api/push/subscription", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        }).catch(() => null);
        await subscription.unsubscribe().catch(() => false);
      }
      return;
    }

    if (!subscription) {
      const keyResponse = await fetch("/api/push/public-key", { cache: "no-store" });
      if (!keyResponse.ok) return;
      const { publicKey } = await keyResponse.json();
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }

    await fetch("/api/push/subscription", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subscription: subscription.toJSON(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Tokyo",
      }),
    });
  } catch (error) {
    console.warn("Web Push sync failed", error);
  }
}

export default function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let reloading = false;
    let syncTimer: ReturnType<typeof setInterval> | null = null;
    let activeRegistration: ServiceWorkerRegistration | null = null;
    const onControllerChange = () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    const installLatest = async () => {
      try {
        if ("caches" in window) {
          const keys = await caches.keys();
          await Promise.all(keys.filter((key) => key.startsWith("eigoloop-") && key !== CACHE_NAME).map((key) => caches.delete(key)));
        }
        const registration = await navigator.serviceWorker.register(`/sw.js?v=${encodeURIComponent(BUILD_ID)}`, { scope: "/", updateViaCache: "none" });
        activeRegistration = registration;
        const activateWaiting = () => registration.waiting?.postMessage({ type: "SKIP_WAITING" });
        activateWaiting();
        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          if (!worker) return;
          worker.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) worker.postMessage({ type: "SKIP_WAITING" });
          });
        });
        await registration.update();
        activateWaiting();
        localStorage.setItem("eigoloop-build", BUILD_ID);
        await syncPushSubscription(registration);
      } catch (error) {
        console.warn("PWA update check failed", error);
      }
    };

    void installLatest();
    syncTimer = setInterval(() => {
      if (activeRegistration) void syncPushSubscription(activeRegistration);
    }, 30 * 1000);

    const onVisible = () => {
      if (document.visibilityState === "visible") void installLatest();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      if (syncTimer) clearInterval(syncTimer);
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}
