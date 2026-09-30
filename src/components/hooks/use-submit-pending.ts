import { useCallback, useEffect, useState } from "react";

export function useSubmitPending() {
  const [pending, setPending] = useState(false);

  useEffect(() => {
    function handlePageShow(event: PageTransitionEvent) {
      if (event.persisted) setPending(false);
    }
    window.addEventListener("pageshow", handlePageShow);
    return () => {
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, []);

  const markPending = useCallback(() => {
    setPending(true);
  }, []);

  return { pending, markPending };
}
