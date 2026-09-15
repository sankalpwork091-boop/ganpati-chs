import { SendEmailCommand, SESv2Client } from "@aws-sdk/client-sesv2";

import { awsCredentials, optionalEnv, SES_REGION } from "./env";

let client: SESv2Client | null = null;

function ses(): SESv2Client {
  if (!client) {
    client = new SESv2Client({
      region: SES_REGION,
      credentials: awsCredentials(),
    });
  }
  return client;
}

const SOCIETY_NAME = "Ganpati Co-operative Housing Society Ltd.";
const PMC_NAME = "Sankalp Project Management Consultants Pvt. Ltd.";

function appUrl(): string {
  return (
    process.env.NEXTAUTH_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000"
  );
}

function fromAddress(): string | undefined {
  return optionalEnv("SES_FROM_ADDRESS");
}

interface EmailPayload {
  to: string[];
  subject: string;
  heading: string;
  body: string[];
  actionLabel?: string;
  actionPath?: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderHtml(payload: EmailPayload): string {
  const paragraphs = payload.body
    .map(
      (line) =>
        `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#334155;">${escapeHtml(
          line,
        )}</p>`,
    )
    .join("");

  const button = payload.actionPath
    ? `<p style="margin:26px 0 0;">
         <a href="${appUrl()}${payload.actionPath}"
            style="background:#b45309;color:#ffffff;text-decoration:none;padding:11px 22px;border-radius:8px;font-size:15px;font-weight:600;display:inline-block;">
           ${escapeHtml(payload.actionLabel || "Open the portal")}
         </a>
       </p>`
    : "";

  return `<!doctype html>
<html><body style="margin:0;background:#f8fafc;padding:24px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;">
    <div style="background:#0f172a;padding:20px 26px;">
      <div style="color:#ffffff;font-size:17px;font-weight:700;">Ganpati CHS — Member Portal</div>
      <div style="color:#94a3b8;font-size:12px;margin-top:3px;">Sector 19, Nerul, Navi Mumbai</div>
    </div>
    <div style="padding:26px;">
      <h1 style="margin:0 0 16px;font-size:19px;color:#0f172a;">${escapeHtml(payload.heading)}</h1>
      ${paragraphs}
      ${button}
    </div>
    <div style="padding:18px 26px;border-top:1px solid #e2e8f0;background:#f8fafc;color:#64748b;font-size:12px;line-height:1.6;">
      <div>${escapeHtml(SOCIETY_NAME)}</div>
      <div>Project management: ${escapeHtml(PMC_NAME)}</div>
      <div style="margin-top:8px;">This is an automated message from the member portal. Documents shared here are confidential to society members.</div>
    </div>
  </div>
</body></html>`;
}

function renderText(payload: EmailPayload): string {
  const action = payload.actionPath
    ? `\n\n${payload.actionLabel || "Open the portal"}: ${appUrl()}${payload.actionPath}`
    : "";
  return `${payload.heading}\n\n${payload.body.join("\n\n")}${action}\n\n--\n${SOCIETY_NAME}\nProject management: ${PMC_NAME}\nThis is an automated message from the member portal.`;
}

/**
 * Sends one email per recipient (never a shared To: line — member addresses are
 * not disclosed to each other).
 *
 * Notification failures are logged and swallowed: a member being approved or a
 * document being uploaded must not fail because SES is unhappy.
 */
async function send(payload: EmailPayload): Promise<void> {
  const from = fromAddress();
  const recipients = [...new Set(payload.to.filter(Boolean))];

  if (!from) {
    console.warn(
      `[ses] SES_FROM_ADDRESS is not set — skipping "${payload.subject}" to ${recipients.length} recipient(s).`,
    );
    return;
  }
  if (recipients.length === 0) return;

  const html = renderHtml(payload);
  const text = renderText(payload);

  // Modest concurrency keeps us well under the SES sandbox send rate.
  const BATCH = 5;
  for (let i = 0; i < recipients.length; i += BATCH) {
    const batch = recipients.slice(i, i + BATCH);
    await Promise.allSettled(
      batch.map(async (address) => {
        try {
          await ses().send(
            new SendEmailCommand({
              FromEmailAddress: from,
              Destination: { ToAddresses: [address] },
              Content: {
                Simple: {
                  Subject: { Data: payload.subject, Charset: "UTF-8" },
                  Body: {
                    Html: { Data: html, Charset: "UTF-8" },
                    Text: { Data: text, Charset: "UTF-8" },
                  },
                },
              },
            }),
          );
        } catch (error) {
          console.error(`[ses] Failed to send to ${address}:`, error);
        }
      }),
    );
  }
}

/** Never let a notification take down the request that triggered it. */
function fireAndForget(task: Promise<void>): void {
  void task.catch((error) => console.error("[ses] Notification failed:", error));
}

// ---------------------------------------------------------------------------
// Notification types
// ---------------------------------------------------------------------------

export function notifyMemberApproved(email: string, name: string | null): void {
  fireAndForget(
    send({
      to: [email],
      subject: "Your Ganpati CHS portal access has been approved",
      heading: `Welcome${name ? `, ${name}` : ""}`,
      body: [
        "Your request for access to the Ganpati CHS member portal has been approved by the managing committee.",
        "You can now view and download redevelopment documents and read the full notice board. If you are already signed in, the portal will unlock on its own within a few seconds — no need to sign out and back in.",
        "Please remember that everything shared in the portal is confidential to society members and must not be redistributed outside the society.",
      ],
      actionLabel: "Open the member portal",
      actionPath: "/portal",
    }),
  );
}

export function notifyMemberRejected(email: string, name: string | null): void {
  fireAndForget(
    send({
      to: [email],
      subject: "Update on your Ganpati CHS portal access request",
      heading: `Hello${name ? `, ${name}` : ""}`,
      body: [
        "Your request for access to the Ganpati CHS member portal was not approved at this time.",
        "If you believe this is an error, please contact the managing committee or the project management consultant so your membership records can be verified.",
      ],
    }),
  );
}

export function notifyMemberRevoked(email: string, name: string | null): void {
  fireAndForget(
    send({
      to: [email],
      subject: "Your Ganpati CHS portal access has been withdrawn",
      heading: `Hello${name ? `, ${name}` : ""}`,
      body: [
        "Your access to the Ganpati CHS member portal has been withdrawn by the managing committee.",
        "If you believe this is an error, please contact the managing committee.",
      ],
    }),
  );
}

export function notifyNewDocument(
  recipients: string[],
  title: string,
  categoryName: string,
): void {
  fireAndForget(
    send({
      to: recipients,
      subject: `New document: ${title}`,
      heading: "A new document has been added",
      body: [
        `"${title}" has been uploaded to the ${categoryName} folder of the member portal.`,
        "Sign in to view or download it. The document list refreshes on its own while the portal is open.",
      ],
      actionLabel: "View documents",
      actionPath: "/portal/documents",
    }),
  );
}

export function notifyNewNotice(
  recipients: string[],
  title: string,
  category: string,
): void {
  fireAndForget(
    send({
      to: recipients,
      subject: `${category === "URGENT" ? "[Urgent] " : ""}Notice: ${title}`,
      heading: "A new notice has been posted",
      body: [
        `"${title}" has been posted to the Ganpati CHS notice board.`,
        "Sign in to the member portal to read it in full.",
      ],
      actionLabel: "Read the notice board",
      actionPath: "/portal/notices",
    }),
  );
}

export function notifyAdminOfNewRequest(
  adminEmails: string[],
  memberName: string | null,
  memberEmail: string,
): void {
  fireAndForget(
    send({
      to: adminEmails,
      subject: "New member access request awaiting approval",
      heading: "A member is waiting for approval",
      body: [
        `${memberName || "A member"} (${memberEmail}) has signed in, accepted the Terms & Conditions, and is waiting for access to be approved.`,
        "Open the admin dashboard to approve or reject the request.",
      ],
      actionLabel: "Review pending approvals",
      actionPath: "/admin/approvals",
    }),
  );
}
