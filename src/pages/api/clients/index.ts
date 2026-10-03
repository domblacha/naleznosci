import type { APIRoute } from "astro";
import { createClient } from "@/lib/services/clients";
import { resultResponse, withClientInput } from "@/lib/services/clients-api";

export const prerender = false;

export const POST: APIRoute = (context) =>
  withClientInput(context, async (supabase, input) => resultResponse(await createClient(supabase, input), 201));
