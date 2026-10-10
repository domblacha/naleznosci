import { useEffect } from "react";

/** A page restored from the bfcache shows its state from before the action on another page; reload fetches fresh SSR data. */
export function useReloadOnBfcacheRestore() {
  useEffect(() => {
    function handlePageShow(event: PageTransitionEvent) {
      if (event.persisted) window.location.reload();
    }
    window.addEventListener("pageshow", handlePageShow);
    return () => {
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, []);
}
