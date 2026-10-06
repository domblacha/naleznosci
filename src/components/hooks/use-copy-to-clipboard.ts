import { useCallback, useEffect, useRef, useState } from "react";

export type CopyStatus = "idle" | "copied" | "error";

const COPIED_RESET_MS = 2000;

export function useCopyToClipboard() {
  const [status, setStatus] = useState<CopyStatus>("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => clearTimer, [clearTimer]);

  const reset = useCallback(() => {
    clearTimer();
    setStatus("idle");
  }, [clearTimer]);

  const copy = useCallback(
    async (text: string) => {
      clearTimer();
      try {
        // navigator.clipboard is missing outside secure contexts.
        if (typeof navigator === "undefined" || !("clipboard" in navigator)) throw new Error("no clipboard");
        await navigator.clipboard.writeText(text);
        setStatus("copied");
        timerRef.current = setTimeout(() => {
          timerRef.current = null;
          setStatus("idle");
        }, COPIED_RESET_MS);
      } catch {
        setStatus("error");
      }
    },
    [clearTimer],
  );

  return { status, copy, reset };
}
