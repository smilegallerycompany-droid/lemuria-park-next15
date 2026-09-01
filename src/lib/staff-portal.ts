"use client";

import { createContext, createElement, useContext, type ReactNode } from "react";

export type StaffPortal = "director" | "admin";

const StaffPortalContext = createContext<StaffPortal>("director");

export function StaffPortalProvider({
  portal,
  children,
}: {
  portal: StaffPortal;
  children: ReactNode;
}) {
  return createElement(StaffPortalContext.Provider, { value: portal }, children);
}

export function useStaffPortal(): StaffPortal {
  return useContext(StaffPortalContext);
}

export function useStaffBasePath(): "/director" | "/admin" {
  return useStaffPortal() === "admin" ? "/admin" : "/director";
}
