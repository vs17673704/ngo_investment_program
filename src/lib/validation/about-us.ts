import { z } from "zod";

// Design.md 5.13.C: Heading is optional (max 150 chars); the paragraph body
// is mandatory (max 20,000 chars) — a heading-only section (no body) is invalid.
export const aboutUsSectionSchema = z.object({
  heading: z.string().trim().max(150, "Heading must be 150 characters or fewer.").optional().or(z.literal("")),
  body: z
    .string()
    .trim()
    .min(1, "Body is required.")
    .max(20000, "Body must be 20,000 characters or fewer."),
});

export type AboutUsSectionInput = z.infer<typeof aboutUsSectionSchema>;

export const MAX_ABOUT_US_SECTIONS = 20;
