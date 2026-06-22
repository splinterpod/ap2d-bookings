import { z } from "zod";

export const usernameSchema = z
  .string()
  .trim()
  .min(3, "Username must be at least 3 characters.")
  .max(32, "Username must be 32 characters or fewer.")
  .regex(/^[a-zA-Z0-9_.-]+$/, "Use letters, numbers, dots, dashes or underscores.");

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

export const createBookingSchema = z.object({
  instrumentId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date."),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, "Invalid start time."),
  durationMinutes: z.coerce.number().int().min(15).max(24 * 60),
  notes: z.string().trim().max(500).optional(),
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
