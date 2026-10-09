import type { APIRoute } from "astro";
import { z } from "zod";
import { json } from "@/lib/http";
import { todayInPoland } from "@/lib/escalation";
import { deactivateClient, restoreClient } from "@/lib/services/clients";
import { resultResponse, withClientAuth } from "@/lib/services/clients-api";

export const prerender = false;

const notFound = () => Promise.resolve(json({ error: "not_found" }, 404));

export const PUT: APIRoute = (context) => {
  const id = z.uuid().safeParse(context.params.id);
  if (!id.success) return notFound();

  return withClientAuth(context, async (supabase) =>
    resultResponse(await deactivateClient(supabase, id.data, todayInPoland(new Date())), 200),
  );
};

export const DELETE: APIRoute = (context) => {
  const id = z.uuid().safeParse(context.params.id);
  if (!id.success) return notFound();

  return withClientAuth(context, async (supabase) => resultResponse(await restoreClient(supabase, id.data), 200));
};
