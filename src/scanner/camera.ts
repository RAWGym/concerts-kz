import jsQR from "jsqr";
import { useCallback, useEffect, useRef, useState } from "react";

type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };

/** Встроенный распознаватель Chrome/Android быстрее; если его нет, работает jsQR. */
async function makeDetector(): Promise<Detector | null> {
  const BD = (window as unknown as { BarcodeDetector?: { new (o: { formats: string[] }): Detector; getSupportedFormats?: () => Promise<string[]> } }).BarcodeDetector;
  if (!BD) return null;
  try {
    const formats = (await BD.getSupportedFormats?.()) ?? [];
    if (!formats.includes("qr_code")) return null;
    return new BD({ formats: ["qr_code"] });
  } catch {
    return null;
  }
}

export type CameraState = "starting" | "on" | "denied" | "unavailable";

/**
 * Камера с постоянным поиском QR. Пока paused = true, кадры не разбираются
 * (на экране результата), но камера не выключается, чтобы не ждать её запуска.
 */
export function useQrScanner(onCode: (code: string) => void, paused: boolean, facing: "back" | "front" = "back") {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [state, setState] = useState<CameraState>("starting");
  const [torch, setTorch] = useState<boolean | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pausedRef = useRef(paused);
  const cbRef = useRef(onCode);
  pausedRef.current = paused;
  cbRef.current = onCode;

  const start = useCallback(async () => {
    setState("starting");
    if (!navigator.mediaDevices?.getUserMedia) return setState("unavailable");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: facing === "front" ? "user" : "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      const v = videoRef.current;
      if (v) {
        v.srcObject = stream;
        v.setAttribute("playsinline", "true");
        await v.play().catch(() => undefined);
      }
      const track = stream.getVideoTracks()[0];
      const caps = (track.getCapabilities?.() ?? {}) as { torch?: boolean };
      setTorch(caps.torch ? false : null);
      setState("on");
    } catch (e) {
      const name = (e as Error).name;
      setState(name === "NotAllowedError" || name === "SecurityError" ? "denied" : "unavailable");
    }
  }, [facing]);

  useEffect(() => {
    start();
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [start]);

  // Разбор кадров примерно 8 раз в секунду.
  useEffect(() => {
    if (state !== "on") return;
    let stop = false;
    let busy = false;
    let timer = 0;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    let detector: Detector | null | undefined;

    const tick = async () => {
      if (stop) return;
      const v = videoRef.current;
      if (!busy && !pausedRef.current && v && v.readyState >= 2 && v.videoWidth) {
        busy = true;
        try {
          if (detector === undefined) detector = await makeDetector();
          let value: string | null = null;
          if (detector) {
            const found = await detector.detect(v);
            value = found[0]?.rawValue ?? null;
          } else {
            // Центральный квадрат кадра, уменьшенный до 640 px: быстро и точно.
            const side = Math.min(v.videoWidth, v.videoHeight) * 0.85;
            const sx = (v.videoWidth - side) / 2;
            const sy = (v.videoHeight - side) / 2;
            const size = Math.min(640, Math.round(side));
            canvas.width = size;
            canvas.height = size;
            ctx.drawImage(v, sx, sy, side, side, 0, 0, size, size);
            const img = ctx.getImageData(0, 0, size, size);
            value = jsQR(img.data, size, size, { inversionAttempts: "attemptBoth" })?.data ?? null;
          }
          if (value && !pausedRef.current) cbRef.current(value);
        } catch {
          /* следующий кадр */
        }
        busy = false;
      }
      timer = window.setTimeout(tick, 120);
    };
    tick();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [state]);

  const toggleTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || torch === null) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torch } as MediaTrackConstraintSet] });
      setTorch(!torch);
    } catch {
      setTorch(null);
    }
  }, [torch]);

  return { videoRef, state, torch, toggleTorch, restart: start };
}
