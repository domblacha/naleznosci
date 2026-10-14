import { vi } from "vitest";

// Podmiana `@/lib/supabase` (importuje `astro:env/server`) klientem zalogowanego użytkownika testu.
vi.mock("@/lib/supabase", async () => {
  const { currentClient } = await import("./current-client");
  return { createClient: () => currentClient() };
});
