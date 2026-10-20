import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { signUpSchema } from "@/lib/auth-schemas";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const parsed = signUpSchema.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) {
    return context.redirect("/auth/signup?error=invalid_input");
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect("/auth/signup?error=config_missing");
  }
  const { data, error } = await supabase.auth.signUp(parsed.data);

  if (error) {
    return context.redirect(`/auth/signup?error=${encodeURIComponent(error.code ?? "unknown")}`);
  }

  // Bez sesji (włączone potwierdzanie maila w Supabase) użytkownik musi najpierw potwierdzić adres.
  if (!data.session) {
    return context.redirect("/auth/signin?error=email_not_confirmed");
  }

  return context.redirect("/");
};
