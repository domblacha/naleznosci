import type { APIRoute } from "astro";
import { z } from "zod";
import { json } from "@/lib/http";
import { senderProfileInputSchema } from "@/lib/sender-profile-schemas";
import { saveSenderProfile } from "@/lib/services/sender-profile";
import { createClient as createSupabase } from "@/lib/supabase";

export const prerender = false;

export const PUT: APIRoute = async (context) => {
  if (!context.locals.user) return json({ error: "unauthorized" }, 401);

  const supabase = createSupabase(context.request.headers, context.cookies);
  if (!supabase) return json({ error: "config_missing" }, 500);

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "invalid_input", fieldErrors: {} }, 400);
  }

  const parsed = senderProfileInputSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: "invalid_input", fieldErrors: z.flattenError(parsed.error).fieldErrors }, 400);
  }

  try {
    return json({ profile: await saveSenderProfile(supabase, parsed.data) }, 200);
  } catch {
    return json({ error: "unknown" }, 500);
  }
};
