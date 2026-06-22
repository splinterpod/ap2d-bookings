"use server";

import { requireUser } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { ACCOUNT_OWNER_EMAIL } from "@/lib/env";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { reportIssueSchema } from "@/lib/validation";

export type ReportFormState = { error?: string; success?: string } | undefined;

const CATEGORY_LABELS: Record<string, string> = {
  webpage: "Webpage",
  software: "Software",
  hardware: "Hardware",
};

export async function reportIssueAction(
  _prev: ReportFormState,
  formData: FormData,
): Promise<ReportFormState> {
  const user = await requireUser();

  const parsed = reportIssueSchema.safeParse({
    category: formData.get("category"),
    description: formData.get("description"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid report." };
  }

  const { category, description } = parsed.data;
  const categoryLabel = CATEGORY_LABELS[category] ?? category;
  const escaped = description
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br/>");

  const admins = await prisma.user.findMany({
    where: { role: "ADMIN", status: "ACTIVE" },
    select: { email: true },
  });

  const recipients = new Set<string>();
  if (category === "webpage") {
    recipients.add(ACCOUNT_OWNER_EMAIL);
  } else {
    recipients.add(ACCOUNT_OWNER_EMAIL);
    for (const admin of admins) {
      recipients.add(admin.email.toLowerCase());
    }
  }

  const subject = `[BenchTime ${categoryLabel}] Report from ${user.username}`;
  const body = `<p><strong>${user.username}</strong> (${user.email}) reported a <strong>${categoryLabel.toLowerCase()}</strong> issue:</p><blockquote style="margin:12px 0;padding:12px;border-left:3px solid #059669;background:#f8fafc;">${escaped}</blockquote>`;

  for (const to of recipients) {
    await sendEmail({
      to,
      subject,
      heading: `${categoryLabel} issue reported`,
      body,
    });
  }

  await audit(user.id, "report.submit", { type: "user", id: user.id }, { category });

  return { success: "Report sent to lab administrators." };
}
