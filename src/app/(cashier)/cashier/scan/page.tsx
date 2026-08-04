"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { ApiClientError } from "@/lib/api/client";
import { cashierCheckIn, type CashierCheckInResult } from "@/lib/api/cashier";

function resultClass(result: CashierCheckInResult["result"]) {
  if (result === "SUCCESS") return "cashier-scan-valid";
  if (result === "ALREADY_USED") return "cashier-scan-used";
  return "cashier-scan-bad";
}

export default function CashierScanPage() {
  const [token, setToken] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CashierCheckInResult | null>(null);
  const [cameraHint, setCameraHint] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const submittingRef = useRef(false);
  const lastTokenRef = useRef("");

  const submitToken = useCallback(async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const response = await cashierCheckIn(trimmed);
      setResult(response);
      lastTokenRef.current = trimmed;
      if (response.result === "SUCCESS") setToken("");
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Не удалось проверить билет");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
      inputRef.current?.focus();
    }
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    let raf = 0;
    let lastScanAt = 0;

    type BarcodeDetectorLike = {
      detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>;
    };
    const DetectorCtor = (
      globalThis as unknown as {
        BarcodeDetector?: new (opts: { formats: string[] }) => BarcodeDetectorLike;
      }
    ).BarcodeDetector;

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraHint("Камера недоступна в этом браузере. Используйте USB-сканер или ручной ввод.");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => undefined);
        }

        if (!DetectorCtor) {
          setCameraHint(
            "Камера подключена. Авто-распознавание QR недоступно в этом браузере — используйте USB-сканер или Chrome/Edge.",
          );
          return;
        }

        const detector = new DetectorCtor({ formats: ["qr_code"] });
        setCameraHint("Наведите камеру на QR билета — распознавание включено.");

        const tick = async () => {
          if (cancelled || !videoRef.current || videoRef.current.readyState < 2) {
            raf = window.requestAnimationFrame(() => void tick());
            return;
          }
          const now = Date.now();
          if (now - lastScanAt > 1200 && !submittingRef.current) {
            lastScanAt = now;
            try {
              const codes = await detector.detect(videoRef.current);
              const value = codes[0]?.rawValue?.trim();
              if (value && value !== lastTokenRef.current) {
                setToken(value);
                await submitToken(value);
              }
            } catch {
              // ignore frame decode errors
            }
          }
          raf = window.requestAnimationFrame(() => void tick());
        };
        raf = window.requestAnimationFrame(() => void tick());
      } catch {
        setCameraHint("Нет доступа к камере. Используйте USB-сканер или ручной ввод токена.");
      }
    })();

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(raf);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [submitToken]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    await submitToken(token);
  }

  return (
    <>
      <h1 className="cashier-page-title">Сканер</h1>
      <p className="cashier-page-sub">
        Камера (BarcodeDetector), USB-сканер или ручной ввод → `/api/cashier/check-in`
      </p>

      <div className="cashier-panel">
        <video
          ref={videoRef}
          muted
          playsInline
          style={{
            width: "100%",
            maxHeight: 220,
            objectFit: "cover",
            borderRadius: 12,
            background: "#1a2410",
            marginBottom: "0.75rem",
          }}
        />
        {cameraHint ? (
          <p style={{ margin: "0 0 1rem", fontSize: "0.85rem", color: "rgba(32,53,16,0.65)" }}>
            {cameraHint}
          </p>
        ) : null}

        <form onSubmit={onSubmit}>
          <div className="cashier-field">
            <label htmlFor="scan-token">Токен билета</label>
            <input
              ref={inputRef}
              id="scan-token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void submitToken(token);
                }
              }}
              placeholder="Отсканируйте или вставьте код"
              autoComplete="off"
              autoFocus
            />
          </div>
          {error ? <p className="cashier-error">{error}</p> : null}
          <button
            type="submit"
            className="cashier-btn cashier-btn-primary"
            style={{ width: "100%" }}
            disabled={submitting || !token.trim()}
          >
            {submitting ? "Проверка…" : "Проверить"}
          </button>
        </form>

        {result ? (
          <div className={`cashier-scan-result ${resultClass(result.result)}`}>
            <div>{result.message}</div>
            <div style={{ fontSize: "0.85rem", fontWeight: 600, marginTop: "0.5rem" }}>
              {result.result}
            </div>
            {result.ticket ? (
              <div style={{ fontSize: "0.9rem", fontWeight: 600, marginTop: "0.35rem" }}>
                {result.ticket.sessionLocalDate} {result.ticket.sessionLocalTime} ·{" "}
                {result.ticket.publicId}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </>
  );
}
