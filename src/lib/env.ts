export const APP_URL = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
export const APP_TIMEZONE = process.env.APP_TIMEZONE ?? "America/Toronto";
export const EMAIL_FROM = process.env.EMAIL_FROM ?? "BenchTime <bookings@ap2d.ca>";
export const RESEND_API_KEY = process.env.RESEND_API_KEY ?? "";
export const CRON_SECRET = process.env.CRON_SECRET ?? "";
/** Singular account owner — may change any user's role except their own. */
export const ACCOUNT_OWNER_EMAIL = (
  process.env.ACCOUNT_OWNER_EMAIL ?? "1auqilsha@gmail.com"
).trim().toLowerCase();
