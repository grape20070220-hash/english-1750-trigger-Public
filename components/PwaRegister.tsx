"use client";

import { useEffect } from "react";

const BUILD_ID = "2026-08-18-learning-loop-v4";
const CACHE_NAME = "eigoloop-shell-v4";

export default function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let reloading = false;
    let timer:ReturnType<typeof setInterval>|null = null;
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
        return registration;
      } catch (error) {
        console.warn("PWA update check failed", error);
        return null;
      }
    };

    const checkReminder = async () => {
      if (!("Notification" in window) || Notification.permission !== "granted") return;
      try {
        const response = await fetch("/api/me", { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json();
        const account = data?.account;
        const progress = data?.progress;
        if (!account?.reminder_enabled) return;
        const now = new Date();
        const hour = now.getHours();
        const targetHour = Number(account.reminder_hour ?? 20);
        if (hour < targetHour) return;
        const goal = Number(account.daily_goal_minutes ?? 15);
        const done = Number(progress?.todayMinutes ?? 0);
        if (done >= goal) return;
        const dateKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
        const storageKey = "eigoloop-reminder-last";
        if (localStorage.getItem(storageKey) === dateKey) return;
        const due = Number(data?.stats?.due ?? 0);
        const remaining = Math.max(1, goal - done);
        const body = due > 0
          ? `今日の会話目標まであと${remaining}分。復習も${due}件あります。`
          : `今日の会話目標まであと${remaining}分。短くても英語を口に出しておこう。`;
        const reg = await navigator.serviceWorker.ready;
        await reg.showNotification("EigoLoop 今日の英会話", {
          body,
          icon: "/icon-192.png",
          badge: "/icon-192.png",
          tag: `eigoloop-daily-${dateKey}`,
          data: { url: "/" },
        });
        localStorage.setItem(storageKey, dateKey);
      } catch (error) {
        console.warn("EigoLoop reminder check failed", error);
      }
    };

    void installLatest().then(() => void checkReminder());
    timer = setInterval(() => void checkReminder(), 5 * 60 * 1000);

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void installLatest();
        void checkReminder();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      if (timer) clearInterval(timer);
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}
