import { z } from "zod";
import { PASSWORD_POLICY_REGEX } from "@/lib/auth/password";

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password: z
    .string()
    .regex(
      PASSWORD_POLICY_REGEX,
      "Password must be 8+ characters and include upper, lower, digit, and special character",
    ),
  referralCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{8}$/, "Referral code must be 8 characters (A-Z, 0-9)")
    .optional()
    .or(z.literal("")),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
