import { z } from "zod";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth-config";

export const signInSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

export const signUpSchema = z.object({
  email: z.email(),
  password: z.string().min(MIN_PASSWORD_LENGTH),
});
