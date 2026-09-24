import { z } from "zod";

// BRD Rule XXXIX.4 server-side max lengths (proposed defaults, applied now).
export const generalEnquirySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(150, "Name must be 150 characters or fewer"),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Enter a valid email address")
    .max(254, "Email must be 254 characters or fewer"),
  phone: z
    .string()
    .trim()
    .max(20, "Phone must be 20 characters or fewer")
    .regex(/^[0-9+\-() .]*$/, "Enter a valid phone number")
    .optional()
    .or(z.literal("")),
  message: z.string().trim().min(1, "Message is required").max(5000, "Message must be 5,000 characters or fewer"),
  // Rule XXXIX.7: mandatory hidden honeypot field — a human never fills it in.
  website: z.string().max(0, "Submission rejected").optional().or(z.literal("")),
});

export type GeneralEnquiryInput = z.infer<typeof generalEnquirySchema>;
