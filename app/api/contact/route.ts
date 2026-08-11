import { NextResponse } from "next/server";

const TENANT_ID = process.env.AZURE_TENANT_ID;
const CLIENT_ID = process.env.AZURE_CLIENT_ID;
const CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET;
const MAILBOX = process.env.CONTACT_MAILBOX;
const TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY;

async function verifyTurnstile(token: string, remoteIp: string | null) {
  const res = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        secret: TURNSTILE_SECRET_KEY!,
        response: token,
        ...(remoteIp ? { remoteip: remoteIp } : {}),
      }),
    }
  );

  if (!res.ok) return false;
  const data = (await res.json()) as { success: boolean };
  return data.success;
}

async function getAccessToken() {
  const res = await fetch(
    `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: CLIENT_ID!,
        client_secret: CLIENT_SECRET!,
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials",
      }),
    }
  );

  if (!res.ok) {
    throw new Error(`Failed to get access token (${res.status})`);
  }

  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

export async function POST(request: Request) {
  if (!TENANT_ID || !CLIENT_ID || !CLIENT_SECRET || !MAILBOX) {
    return NextResponse.json(
      { error: "Contact form is not configured yet." },
      { status: 503 }
    );
  }

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  const turnstileToken =
    typeof body?.turnstileToken === "string" ? body.turnstileToken : "";

  if (!name || !email || !message) {
    return NextResponse.json(
      { error: "Name, email, and message are required." },
      { status: 400 }
    );
  }

  if (TURNSTILE_SECRET_KEY) {
    if (!turnstileToken) {
      return NextResponse.json(
        { error: "Please complete the verification check." },
        { status: 400 }
      );
    }

    const remoteIp = request.headers.get("x-forwarded-for");
    const verified = await verifyTurnstile(turnstileToken, remoteIp).catch(
      () => false
    );

    if (!verified) {
      return NextResponse.json(
        { error: "Verification failed. Please try again." },
        { status: 400 }
      );
    }
  }

  try {
    const token = await getAccessToken();

    const sendRes = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(
        MAILBOX
      )}/sendMail`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: {
            subject: `Website enquiry from ${name}`,
            body: {
              contentType: "Text",
              content: `${message}\n\nFrom: ${name} (${email})`,
            },
            toRecipients: [{ emailAddress: { address: MAILBOX } }],
            replyTo: [{ emailAddress: { address: email } }],
          },
          saveToSentItems: true,
        }),
      }
    );

    if (!sendRes.ok) {
      console.error("Graph sendMail failed", sendRes.status, await sendRes.text());
      return NextResponse.json(
        { error: "Failed to send message." },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Contact form error", err);
    return NextResponse.json(
      { error: "Failed to send message." },
      { status: 500 }
    );
  }
}
