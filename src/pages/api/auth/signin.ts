import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { signInSchema } from "@/lib/auth-schemas";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const parsed = signInSchema.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) {
    return context.redirect("/auth/signin?error=invalid_input");
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect("/auth/signin?error=config_missing");
  }
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    return context.redirect(`/auth/signin?error=${encodeURIComponent(error.code ?? "unknown")}`);
  }

  return context.redirect("/");
};
