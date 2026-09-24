import { z } from "zod";

// Design.md 1.5 / 5.13.D: all fields optional (unconfigured fields are simply
// omitted from the public page), limits per Rule XXXIX.
export const socialLinkSchema = z.object({
  label: z.string().trim().min(1).max(50),
  url: z.string().trim().url().max(2048),
});

export const contactUsContentSchema = z.object({
  address: z.string().trim().max(1000, "Address must be 1,000 characters or fewer.").optional().or(z.literal("")),
  phone: z.string().trim().max(20, "Phone must be 20 characters or fewer.").optional().or(z.literal("")),
  email: z
    .string()
    .trim()
    .max(254, "Email must be 254 characters or fewer.")
    .email("Enter a valid email address.")
    .optional()
    .or(z.literal("")),
  website: z
    .string()
    .trim()
    .max(2048, "Website must be 2,048 characters or fewer.")
    .url("Enter a valid URL.")
    .optional()
    .or(z.literal("")),
  socialLinks: z.array(socialLinkSchema).max(10).optional(),
});

export type ContactUsContentInput = z.infer<typeof contactUsContentSchema>;
export type SocialLink = z.infer<typeof socialLinkSchema>;
