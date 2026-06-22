import "server-only";
import { Resend } from "resend";
import { APP_URL, EMAIL_FROM, RESEND_API_KEY } from "./env";
import { EMAIL_FOOTER_LINE } from "./branding";

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

type SendArgs = {
  to: string;
  subject: string;
  heading: string;
  body: string;
  cta?: { label: string; href: string };
};

function wrap({ heading, body, cta }: Omit<SendArgs, "to" | "subject">): string {
  const button = cta
    ? `<p style="margin:24px 0;"><a href="${cta.href}" style="background:#059669;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600;">${cta.label}</a></p>`
    : "";
  return `
  <div style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#0f172a;">
    <h1 style="font-size:18px;margin:0 0 8px;">${heading}</h1>
    <div style="font-size:14px;line-height:1.6;color:#334155;">${body}</div>
    ${button}
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />
    <p style="font-size:12px;color:#94a3b8;">${EMAIL_FOOTER_LINE} · <a href="${APP_URL}" style="color:#059669;">${APP_URL.replace(/^https?:\/\//, "")}</a></p>
  </div>`;
}

/** Sends an email via Resend, or logs to the console when no API key is configured. */
export async function sendEmail(args: SendArgs): Promise<void> {
  const html = wrap(args);
  if (!resend) {
    console.info(
      `\n[email:dev] To: ${args.to}\n[email:dev] Subject: ${args.subject}\n[email:dev] ${args.heading}\n${args.body.replace(/<[^>]+>/g, "")}\n${args.cta ? `[email:dev] ${args.cta.label}: ${args.cta.href}\n` : ""}`,
    );
    return;
  }
  try {
    const { error } = await resend.emails.send({
      from: EMAIL_FROM,
      to: args.to,
      subject: args.subject,
      html,
    });
    if (error) {
      console.error("[email] send failed:", error);
    }
  } catch (err) {
    console.error("[email] send failed:", err);
  }
}
