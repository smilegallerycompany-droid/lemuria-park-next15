"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { ApiClientError, apiGet, apiPatch, apiPost } from "@/lib/api/client";
import { formatMoneyFromKopecks } from "@/lib/utils";
import type { LocationRow, ShiftDto, ShiftPayload } from "./shift-types";
import { rublesToKopecks } from "./shift-types";

type Sheet = null | "in" | "out";

type Ctx = {
  loading: boolean;
  error: string | null;
  shift: ShiftDto | null;
  lastClosed: ShiftDto | null;
  locations: LocationRow[];
  toast: string | null;
  sheet: Sheet;
  setSheet: (sheet: Sheet) => void;
  reload: () => Promise<ShiftPayload | null>;
  openShift: (input: { locationId: string; openingCashAmount: number; notes: string }) => Promise<void>;
  closeShift: (input: { closingCashAmount: number; notes: string }) => Promise<ShiftDto>;
  cashMove: (type: "IN" | "OUT", amountKopecks: number, comment: string) => Promise<void>;
  clearError: () => void;
};

const CashierShiftContext = createContext<Ctx | null>(null);

export function useCashierShift() {
  const ctx = useContext(CashierShiftContext);
  if (!ctx) throw new Error("useCashierShift must be used within CashierShiftProvider");
  return ctx;
}

export function useCashierShiftOptional() {
  return useContext(CashierShiftContext);
}

export function CashierShiftProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shift, setShift] = useState<ShiftDto | null>(null);
  const [lastClosed, setLastClosed] = useState<ShiftDto | null>(null);
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [sheet, setSheet] = useState<Sheet>(null);

  const reload = useCallback(async () => {
    try {
      const payload = await apiGet<ShiftPayload>("/api/cashier/shift");
      setShift(payload.shift);
      setLastClosed(payload.lastClosed);
      return payload;
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 401) {
        setShift(null);
        return null;
      }
      throw err;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await reload();
        const locs = await apiGet<{ locations: LocationRow[] }>("/api/cashier/locations");
        if (!cancelled) setLocations(locs.locations);
      } catch (err) {
        if (!cancelled && !(err instanceof ApiClientError && err.status === 401)) {
          setError(err instanceof ApiClientError ? err.message : "Ошибка смены");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reload]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(id);
  }, [toast]);

  const openShift = useCallback(
    async (input: { locationId: string; openingCashAmount: number; notes: string }) => {
      setError(null);
      await apiPost("/api/cashier/shift", {
        locationId: input.locationId,
        openingCashAmount: input.openingCashAmount,
        notes: input.notes || null,
      });
      await reload();
      setToast("Смена открыта");
    },
    [reload],
  );

  const closeShift = useCallback(
    async (input: { closingCashAmount: number; notes: string }) => {
      setError(null);
      const result = await apiPatch<{ report?: ShiftDto; shift: ShiftDto }>(
        "/api/cashier/shift",
        {
          closingCashAmount: input.closingCashAmount,
          notes: input.notes || null,
        },
      );
      const report = result.report ?? result.shift;
      setShift(null);
      setLastClosed(report);
      return report;
    },
    [],
  );

  const cashMove = useCallback(
    async (type: "IN" | "OUT", amountKopecks: number, comment: string) => {
      setError(null);
      await apiPost("/api/cashier/shift/cash", { type, amount: amountKopecks, comment });
      await reload();
      setSheet(null);
      setToast(type === "IN" ? `Внесено ${formatMoneyFromKopecks(amountKopecks)}` : `Изъято ${formatMoneyFromKopecks(amountKopecks)}`);
    },
    [reload],
  );

  const value = useMemo<Ctx>(
    () => ({
      loading,
      error,
      shift,
      lastClosed,
      locations,
      toast,
      sheet,
      setSheet,
      reload,
      openShift,
      closeShift,
      cashMove,
      clearError: () => setError(null),
    }),
    [loading, error, shift, lastClosed, locations, toast, sheet, reload, openShift, closeShift, cashMove],
  );

  return <CashierShiftContext.Provider value={value}>{children}</CashierShiftContext.Provider>;
}

export { rublesToKopecks };
