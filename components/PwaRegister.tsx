"use client";

import { useEffect } from "react";

const BUILD_ID = "2026-08-18-shadowing-v3";

export default function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let reloading = false;
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
          await Promise.all(
            keys
              .filter((key) => key.startsWith("eigoloop-") && key !== "eigoloop-shell-v3")
              .map((key) => caches.delete(key))
          );
        }

        const registration = await navigator.serviceWorker.register(
          `/sw.js?v=${encodeURIComponent(BUILD_ID)}`,
          { scope: "/", updateViaCache: "none" }
        );

        const activateWaiting = () => registration.waiting?.postMessage({ type: "SKIP_WAITING" });
        activateWaiting();

        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          if (!worker) return;
          worker.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) {
              worker.postMessage({ type: "SKIP_WAITING" });
            }
          });
        });

        await registration.update();
        activateWaiting();
        localStorage.setItem("eigoloop-build", BUILD_ID);
      } catch (error) {
        console.warn("PWA update check failed", error);
      }
    };

    void installLatest();

    const onVisible = () => {
      if (document.visibilityState === "visible") void installLatest();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}
