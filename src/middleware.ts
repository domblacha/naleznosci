import { defineMiddleware } from "astro:middleware";
import { createClient } from "@/lib/supabase";

// Prefix-matched protected routes (future routes). "/" is protected separately with an exact match,
// because a "/" prefix would match every path and cause a redirect loop.
const PROTECTED_ROUTES: string[] = ["/clients", "/history", "/settings"];
const AUTH_PAGES = ["/auth/signin", "/auth/signup"];

export const onRequest = defineMiddleware(async (context, next) => {
  const supabase = createClient(context.request.headers, context.cookies);

  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    context.locals.user = user ?? null;
  } else {
    context.locals.user = null;
  }

  const { pathname } = context.url;

  if (context.locals.user && AUTH_PAGES.includes(pathname)) {
    return context.redirect("/");
  }

  const isProtected = pathname === "/" || PROTECTED_ROUTES.some((route) => pathname.startsWith(route));
  if (isProtected && !context.locals.user) {
    return context.redirect("/auth/signin");
  }

  return next();
});
