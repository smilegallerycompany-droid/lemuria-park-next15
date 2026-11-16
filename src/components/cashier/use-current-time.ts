"use client";

import { useEffect, useState } from "react";

export function useCurrentTime() {
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    const update = () => setNow(Date.now());
    update();
    const timer = window.setInterval(update, 1000);
    document.addEventListener("visibilitychange", update);
    window.addEventListener("pageshow", update);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("pageshow", update);
    };
  }, []);

  return now;
}
