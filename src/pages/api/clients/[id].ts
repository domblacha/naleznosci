import type { APIRoute } from "astro";
import { z } from "zod";
import { updateClient } from "@/lib/services/clients";
import { json, resultResponse, withClientInput } from "@/lib/services/clients-api";

export const prerender = false;

export const PUT: APIRoute = (context) => {
  const id = z.uuid().safeParse(context.params.id);
  if (!id.success) return Promise.resolve(json({ error: "not_found" }, 404));

  return withClientInput(context, async (supabase, input) =>
    resultResponse(await updateClient(supabase, id.data, input), 200),
  );
};
