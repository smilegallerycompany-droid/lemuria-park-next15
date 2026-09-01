"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { ApiClientError } from "@/lib/api/client";
import { cashierCheckIn, type CashierCheckInResult } from "@/lib/api/cashier";
import { shouldAcceptScan } from "@/lib/cashier/scan-guard";
import { scannerStatusTitle, scannerStatusTone } from "@/lib/cashier/scanner-status";

type Phase = "idle" | "camera" | "result" | "manual";

type Prefs = {
  scanSound: boolean;
  scanVibrate: boolean;
  preferredCamera: "environment" | "user";
};

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem("lemuria.cashier.prefs");
    if (!raw) return { scanSound: true, scanVibrate: true, preferredCamera: "environment" };
    return JSON.parse(raw) as Prefs;
  } catch {
    return { scanSound: true, scanVibrate: true, preferredCamera: "environment" };
  }
}

function feedback(prefs: Prefs, ok: boolean) {
  if (prefs.scanVibrate && typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate(ok ? [40] : [80, 40, 80]);
  }
  if (prefs.scanSound && typeof window !== "undefined") {
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = ok ? 880 : 220;
      gain.gain.value = 0.04;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
      void ctx.close();
    } catch {
      /* ignore */
    }
  }
}

function resultMark(result: CashierCheckInResult["result"]) {
  const tone = scannerStatusTone(result);
  if (tone === "valid") return "✓";
  if (tone === "used") return "↻";
  if (tone === "refunded") return "↩";
  return "✕";
}

export function QrScanner() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CashierCheckInResult | null>(null);
  const [manual, setManual] = useState("");
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [online, setOnline] = useState(true);
  const [secureOk, setSecureOk] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const submittingRef = useRef(false);
  const lastTokenRef = useRef("");
  const lastAtRef = useRef(0);
  const wedgeBuffer = useRef("");
  const wedgeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prefs = useRef(loadPrefs());

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setTorchOn(false);
    setTorchSupported(false);
  }, []);

  useEffect(() => {
    setSecureOk(window.isSecureContext || location.hostname === "localhost");
    prefs.current = loadPrefs();
    setFacing(prefs.current.preferredCamera);
    const syncOnline = () => setOnline(navigator.onLine);
    syncOnline();
    window.addEventListener("online", syncOnline);
    window.addEventListener("offline", syncOnline);

    function onVisibility() {
      if (document.visibilityState === "hidden") {
        stopCamera();
        setPhase((current) => (current === "camera" ? "idle" : current));
      }
    }
    function onPageHide() {
      stopCamera();
      setPhase((current) => (current === "camera" ? "idle" : current));
    }
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);

    return () => {
      window.removeEventListener("online", syncOnline);
      window.removeEventListener("offline", syncOnline);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      stopCamera();
    };
  }, [stopCamera]);

  const submitToken = useCallback(
    async (value: string) => {
      const trimmed = value.trim();
      if (!trimmed || submittingRef.current) return;
      if (
        !shouldAcceptScan({
          token: trimmed,
          lastToken: lastTokenRef.current,
          lastAtMs: lastAtRef.current,
          nowMs: Date.now(),
        })
      ) {
        return;
      }
      if (!navigator.onLine) {
        setError("Нет соединения. Проверка билета требует подключения к интернету");
        return;
      }
      submittingRef.current = true;
      setError(null);
      try {
        const response = await cashierCheckIn(trimmed);
        lastTokenRef.current = trimmed;
        lastAtRef.current = Date.now();
        setResult(response);
        setPhase("result");
        stopCamera();
        feedback(prefs.current, response.result === "SUCCESS");
      } catch (err) {
        if (!navigator.onLine) {
          setError("Нет соединения. Проверка билета требует подключения к интернету");
        } else {
          setError(err instanceof ApiClientError ? err.message : "Не удалось проверить билет");
        }
      } finally {
        submittingRef.current = false;
      }
    },
    [stopCamera],
  );

  useEffect(() => {
    if (phase === "camera" || phase === "result") return;
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "Enter") {
        const token = wedgeBuffer.current.trim();
        wedgeBuffer.current = "";
        if (token.length >= 8) void submitToken(token);
        return;
      }
      if (e.key.length === 1) {
        wedgeBuffer.current += e.key;
        if (wedgeTimer.current) clearTimeout(wedgeTimer.current);
        wedgeTimer.current = setTimeout(() => {
          wedgeBuffer.current = "";
        }, 80);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, submitToken]);

  const startCamera = useCallback(
    async (mode: "environment" | "user" = facing) => {
      setError(null);
      if (!secureOk) {
        setError("Для камеры нужен HTTPS (или localhost). Используйте ручной ввод.");
        setPhase("manual");
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("Камера недоступна. Используйте ручной ввод или USB-сканер.");
        setPhase("manual");
        return;
      }
      stopCamera();
      setPhase("camera");
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: mode },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play();
        }
        const track = stream.getVideoTracks()[0];
        const caps = track?.getCapabilities?.() as { torch?: boolean } | undefined;
        setTorchSupported(Boolean(caps?.torch));
      } catch (err) {
        const name = err instanceof DOMException ? err.name : "";
        if (name === "NotAllowedError" || name === "PermissionDeniedError") {
          setError("Доступ к камере запрещён. Разрешите доступ или введите код вручную.");
        } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
          setError("Камера не найдена. Используйте ручной ввод или USB-сканер.");
        } else if (name === "NotReadableError" || name === "TrackStartError") {
          setError("Камера занята другим приложением. Закройте его и попробуйте снова.");
        } else {
          setError("Нет доступа к камере. Разрешите доступ или введите код вручную.");
        }
        setPhase("manual");
        stopCamera();
      }
    },
    [facing, secureOk, stopCamera],
  );

  useEffect(() => {
    if (phase !== "camera") return;
    let cancelled = false;
    let raf = 0;
    let zxingControls: { stop: () => void } | null = null;

    type DetectorLike = {
      detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>;
    };
    const DetectorCtor = (
      globalThis as unknown as {
        BarcodeDetector?: new (opts: { formats: string[] }) => DetectorLike;
      }
    ).BarcodeDetector;

    async function loopNative(detector: DetectorLike) {
      const video = videoRef.current;
      if (cancelled) return;
      if (video && video.readyState >= 2 && !submittingRef.current) {
        try {
          const codes = await detector.detect(video);
          const value = codes[0]?.rawValue?.trim();
          if (value) {
            await submitToken(value);
            return;
          }
        } catch {
          /* continue */
        }
      }
      raf = requestAnimationFrame(() => void loopNative(detector));
    }

    async function startFallback() {
      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const reader = new BrowserMultiFormatReader();
        const video = videoRef.current;
        if (!video || !streamRef.current) return;
        zxingControls = await reader.decodeFromStream(streamRef.current, video, (res) => {
          const text = res?.getText()?.trim();
          if (text) void submitToken(text);
        });
      } catch {
        if (!cancelled) {
          setError("Не удалось запустить распознавание QR. Используйте ручной ввод.");
        }
      }
    }

    if (DetectorCtor) {
      const detector = new DetectorCtor({ formats: ["qr_code"] });
      raf = requestAnimationFrame(() => void loopNative(detector));
    } else {
      void startFallback();
    }

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      zxingControls?.stop();
    };
  }, [phase, submitToken]);

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({
        // @ts-expect-error torch is not in standard TS DOM lib yet
        advanced: [{ torch: !torchOn }],
      });
      setTorchOn((v) => !v);
    } catch {
      setTorchSupported(false);
    }
  }

  async function switchCamera() {
    const next = facing === "environment" ? "user" : "environment";
    setFacing(next);
    await startCamera(next);
  }

  function scanNext() {
    setResult(null);
    setError(null);
    setManual("");
    // Allow verifying the same physical ticket again (ALREADY_USED UX).
    lastTokenRef.current = "";
    lastAtRef.current = 0;
    setPhase("idle");
  }

  function onManual(e: FormEvent) {
    e.preventDefault();
    void submitToken(manual);
  }

  if (phase === "result" && result) {
    const tone = scannerStatusTone(result.result);
    return (
      <div
        className={`cashier-scan-result-screen tone-${tone}`}
        role="status"
        aria-live="assertive"
      >
        <p className="cashier-scan-result-mark" aria-hidden>
          {resultMark(result.result)}
        </p>
        <h1>{scannerStatusTitle(result.result)}</h1>
        <p>{result.message}</p>
        {result.ticket ? (
          <>
            <p>
              Сеанс: {result.ticket.sessionLocalDate} {result.ticket.sessionLocalTime}
            </p>
            <p>Билет: {result.ticket.publicId}</p>
            {result.result === "WRONG_LOCATION" && result.ticket.locationName ? (
              <p>Нужная локация: {result.ticket.locationName}</p>
            ) : null}
            {result.ticket.usedAt ? (
              <p>Первый проход: {new Date(result.ticket.usedAt).toLocaleString("ru-RU")}</p>
            ) : null}
          </>
        ) : null}
        <button type="button" className="cashier-btn cashier-btn-primary" onClick={scanNext}>
          Сканировать следующий
        </button>
      </div>
    );
  }

  if (phase === "camera") {
    return (
      <div className="cashier-scan-live">
        <video
          ref={videoRef}
          playsInline
          muted
          className="cashier-scan-video"
          aria-label="Камера сканера"
        />
        <div className="cashier-scan-overlay" aria-hidden>
          <div className="cashier-scan-frame" />
        </div>
        <div className="cashier-scan-toolbar">
          <button
            type="button"
            className="cashier-btn cashier-btn-ghost"
            onClick={() => {
              stopCamera();
              setPhase("idle");
            }}
          >
            Закрыть
          </button>
          <button
            type="button"
            className="cashier-btn cashier-btn-ghost"
            onClick={() => void switchCamera()}
            aria-label="Сменить камеру"
          >
            Камера
          </button>
          {torchSupported ? (
            <button
              type="button"
              className="cashier-btn cashier-btn-ghost"
              onClick={() => void toggleTorch()}
              aria-label="Фонарик"
            >
              {torchOn ? "Фонарик выкл" : "Фонарик"}
            </button>
          ) : null}
          <button
            type="button"
            className="cashier-btn cashier-btn-ghost"
            onClick={() => {
              stopCamera();
              setPhase("manual");
            }}
          >
            Вручную
          </button>
        </div>
        {error ? <p className="cashier-scan-error">{error}</p> : null}
        <p className="cashier-scan-status">{online ? "Онлайн" : "Нет сети"}</p>
      </div>
    );
  }

  return (
    <div className="cashier-scan-idle">
      <div className="cashier-scan-hero" aria-hidden>
        <svg width="96" height="96" viewBox="0 0 96 96" fill="none">
          <rect x="12" y="12" width="28" height="28" rx="4" stroke="#1f6b45" strokeWidth="4" />
          <rect x="56" y="12" width="28" height="28" rx="4" stroke="#1f6b45" strokeWidth="4" />
          <rect x="12" y="56" width="28" height="28" rx="4" stroke="#1f6b45" strokeWidth="4" />
          <path
            d="M56 64h12v12H56V64Zm16 0h12v12H72V64Zm-16 16h12v12H56V80Zm16 0h12v12H72V80Z"
            fill="#d97706"
          />
        </svg>
      </div>
      <h1 className="cashier-page-title">QR-сканер</h1>
      <p className="cashier-page-sub">Наведите камеру на QR-код билета</p>
      {!secureOk ? (
        <p className="cashier-error">
          Камера требует HTTPS. На незащищённом HTTP доступен только ручной ввод.
        </p>
      ) : null}
      {error ? <p className="cashier-error">{error}</p> : null}
      <div className="cashier-actions-row">
        <button
          type="button"
          className="cashier-btn cashier-btn-primary"
          onClick={() => void startCamera()}
        >
          Включить камеру
        </button>
        <button type="button" className="cashier-btn cashier-btn-ghost" onClick={() => setPhase("manual")}>
          Ввести код вручную
        </button>
      </div>
      {phase === "manual" ? (
        <form className="cashier-form" onSubmit={onManual} style={{ marginTop: 16 }}>
          <label>
            QR token
            <input
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              autoComplete="off"
              placeholder="Вставьте или отсканируйте USB-сканером"
            />
          </label>
          <button type="submit" className="cashier-btn cashier-btn-primary">
            Проверить
          </button>
        </form>
      ) : (
        <p className="cashier-page-sub" style={{ marginTop: 16 }}>
          USB/Bluetooth-сканер работает как клавиатура — отсканируйте код на этом экране.
        </p>
      )}
    </div>
  );
}
