import { useEffect, useState } from "react";

import { native } from "./feedback";
import { isIOS, isStandalone } from "./core";

/* Веб-версия приложения тикетора (PWA): установка на экран «Домой» и обновления. */

/** Регистрирует service worker сканера. В Android-приложении он тоже работает. */
export function registerScannerSW() {
  if (!("serviceWorker" in navigator) || !location.pathname.startsWith("/scanner")) return;
  navigator.serviceWorker.register("/scanner/sw.js", { scope: "/scanner/" }).catch(() => undefined);
}

/** Нужна подсказка «Установите на экран Домой»: iPhone, открыто во вкладке браузера. */
export const needsIOSInstall = () => isIOS() && !isStandalone() && !native();

/** Адрес файла сборки, с которым запущена страница. */
function currentBuild() {
  return document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/"]')?.getAttribute("src") ?? null;
}

async function latestBuild() {
  const res = await fetch(`/scanner/?v=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) return null;
  return (await res.text()).match(/<script[^>]+type="module"[^>]+src="([^"]*\/assets\/[^"]+)"/)?.[1] ?? null;
}

/**
 * Следит за новой версией сайта. Если она вышла, перезагружает страницу,
 * но только в безопасный момент (canReload): не посреди проверки билета.
 * Ещё перезагружает сразу при возврате в приложение из фона.
 */
export function useWebUpdate(canReload: boolean) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const mine = currentBuild();
    if (!mine) return; // режим разработки
    let stop = false;
    const check = async (resumed = false) => {
      if (stop || document.visibilityState !== "visible") return;
      const fresh = await latestBuild().catch(() => null);
      if (!fresh || fresh === mine) return;
      // Только что вернулись в приложение: на экране ничего важного, обновляемся сразу.
      if (resumed) location.reload();
      else setReady(true);
    };
    const t = setInterval(() => check(), 5 * 60000);
    const vis = () => document.visibilityState === "visible" && check(true);
    document.addEventListener("visibilitychange", vis);
    check(true);
    return () => {
      stop = true;
      clearInterval(t);
      document.removeEventListener("visibilitychange", vis);
    };
  }, []);

  useEffect(() => {
    if (ready && canReload) location.reload();
  }, [ready, canReload]);

  return ready;
}
