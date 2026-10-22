import { useEffect, useState } from "react";

import type { Locale } from "@/i18n/config";
import { useSiteSettings } from "@/lib/site-settings";

/** Объявление из настроек сайта: плашка внизу экрана, закрывается. */
export function Announcement({ locale }: { locale: Locale }) {
  const { announcement: a } = useSiteSettings();
  const text = a.text?.[locale] || a.text?.ru || "";
  const key = `announce:${text}`;
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    try {
      setHidden(localStorage.getItem(key) === "1");
    } catch {
      setHidden(false);
    }
  }, [key]);

  if (!a.enabled || !text || hidden) return null;

  const close = () => {
    setHidden(true);
    try { localStorage.setItem(key, "1"); } catch { /* приватный режим */ }
  };

  const body = <span className="text-sm text-fg">{text}</span>;

  return (
    <div className="fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-xl items-center gap-4 rounded-card border border-coral/40 bg-ink/95 px-4 py-3 shadow-[0_20px_60px_rgba(0,0,0,0.5)] backdrop-blur">
      <span className="h-2 w-2 shrink-0 rounded-full bg-coral" />
      <div className="min-w-0 flex-1">
        {a.link ? <a href={a.link} className="hover:text-coral">{body} <span className="text-coral">→</span></a> : body}
      </div>
      <button onClick={close} aria-label="Закрыть" className="text-lg leading-none text-fg-subtle hover:text-fg">×</button>
    </div>
  );
}
