import { z } from "zod";

const USERNAME_PATTERN = /^[a-zA-Z0-9_.-]+$/;

/** Normalizes mobile/smart-keyboard quirks before username validation. */
export function normalizeUsernameInput(raw: string): string {
  return raw
    .trim()
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2212]/g, "-")
    .replace(/[\uFF0E\u00B7\u2219]/g, ".");
}

function usernameFormatMessage(value: string): string | null {
  if (value.includes("@")) {
    return "Username can't be an email address — use a short login name without @.";
  }
  if (/\s/.test(value)) {
    return "Username can't contain spaces. Use letters, numbers, dots, dashes, or underscores.";
  }
  if (!USERNAME_PATTERN.test(value)) {
    return "Use letters, numbers, dots, dashes, or underscores.";
  }
  return null;
}

export const usernameSchema = z
  .string()
  .transform(normalizeUsernameInput)
  .pipe(
    z
      .string()
      .min(3, "Username must be at least 3 characters.")
      .max(32, "Username must be 32 characters or fewer.")
      .superRefine((value, ctx) => {
        const message = usernameFormatMessage(value);
        if (message) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message });
        }
      }),
  );

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  username: usernameSchema,
  password: z.string().min(8, "Password must be at least 8 characters.").max(200),
});

export const loginSchema = z.object({
  identifier: z.string().trim().min(1, "Enter your email or username."),
  password: z.string().min(1, "Enter your password."),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8, "Password must be at least 8 characters.").max(200),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password."),
  newPassword: z.string().min(8, "Password must be at least 8 characters.").max(200),
});

export const changeUsernameSchema = z.object({
  username: usernameSchema,
});

export const reportIssueSchema = z.object({
  category: z.enum(["webpage", "software", "hardware"], {
    errorMap: () => ({ message: "Select an issue type." }),
  }),
  description: z
    .string()
    .trim()
    .min(10, "Please describe the issue in at least 10 characters.")
    .max(2000, "Description must be 2000 characters or fewer."),
});

export const createBookingSchema = z.object({
  instrumentId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date."),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, "Invalid start time."),
  durationMinutes: z.coerce.number().int().min(15).max(24 * 60),
  notes: z.string().trim().max(500).optional(),
  targetUserId: z.string().min(1).optional(),
});

const photonField = z
  .union([z.coerce.number().nonnegative(), z.literal("").transform(() => null), z.null()])
  .optional();

export const laserReadingSchema = z.object({
  wavelengthNm: z.coerce.number().int(),
  calibrated: z.coerce.boolean(),
  photonCount: photonField,
});

export const sessionFormSchema = z.object({
  bookingId: z.string().min(1),
  skipped: z.coerce.boolean().optional(),
  laserTurnedOn: z.coerce.boolean().optional(),
  laserAlreadyOn: z.coerce.boolean().optional(),
  readings: z.array(laserReadingSchema).optional(),
});

export const LASER_WAVELENGTHS = [532, 633, 785] as const;
