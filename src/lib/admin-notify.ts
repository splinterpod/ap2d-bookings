import "server-only";
import { sendEmail } from "./email";
import { APP_URL, ACCOUNT_OWNER_EMAIL } from "./env";
import { formatBookingEnd, formatBookingRange } from "./time";

type UserRef = { username: string; email: string };
type InstrumentRef = { name: string; slug: string };

async function adminEmails(): Promise<string[]> {
  const { prisma } = await import("./db");
  const admins = await prisma.user.findMany({
    where: { role: "ADMIN", status: "ACTIVE" },
    select: { email: true },
  });
  const recipients = new Set<string>([ACCOUNT_OWNER_EMAIL.toLowerCase()]);
  for (const a of admins) recipients.add(a.email.toLowerCase());
  return [...recipients];
}

export async function notifyAdminsOfBookingRequest(args: {
  kind: "new" | "extension";
  user: UserRef;
  instrument: InstrumentRef;
  startAt: Date;
  endAt: Date;
  requestedEndAt?: Date;
}): Promise<void> {
  const { kind, user, instrument, startAt, endAt, requestedEndAt } = args;
  const range =
    kind === "extension" && requestedEndAt
      ? `${formatBookingRange(startAt, endAt)} → until ${formatBookingEnd(startAt, requestedEndAt)}`
      : formatBookingRange(startAt, endAt, "EEE MMM d, h:mm a");

  const heading =
    kind === "extension" ? "Extension request — review required" : "Booking request — review required";
  const subject = `[BenchTime] ${kind === "extension" ? "Extension" : "Booking"} request from ${user.username}`;
  const body = `<p><strong>${user.username}</strong> (${user.email}) requested time on <strong>${instrument.name}</strong>:</p><p>${range}</p><p>Approve or decline in the admin bookings queue.</p>`;

  for (const to of await adminEmails()) {
    await sendEmail({
      to,
      subject,
      heading,
      body,
      cta: { label: "Review requests", href: `${APP_URL}/admin/bookings` },
    });
  }
}

export async function notifyAdminsOfRequestCancelled(args: {
  kind: "booking" | "extension";
  user: UserRef;
  instrument: InstrumentRef;
  startAt: Date;
  endAt: Date;
  requestedEndAt?: Date | null;
}): Promise<void> {
  const { kind, user, instrument, startAt, endAt, requestedEndAt } = args;
  const range =
    kind === "extension" && requestedEndAt
      ? `${formatBookingRange(startAt, endAt)} → ${formatBookingEnd(startAt, requestedEndAt)} (withdrawn)`
      : formatBookingRange(startAt, endAt, "EEE MMM d, h:mm a");

  const subject = `[BenchTime] ${kind === "extension" ? "Extension" : "Booking"} request cancelled — ${user.username}`;
  const body = `<p><strong>${user.username}</strong> (${user.email}) cancelled their ${kind === "extension" ? "extension" : "booking"} request on <strong>${instrument.name}</strong>:</p><p>${range}</p>`;

  for (const to of await adminEmails()) {
    await sendEmail({
      to,
      subject,
      heading: "Request cancelled",
      body,
      cta: { label: "Admin bookings", href: `${APP_URL}/admin/bookings` },
    });
  }
}
