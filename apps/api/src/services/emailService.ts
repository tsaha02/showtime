import { Resend } from "resend";
import QRCode from "qrcode";
import { env } from "../config/env";
import type { BookingDTO } from "@showtime/shared";

// Every email this app sends goes through here, and every call is
// designed to NEVER throw in a way that breaks its caller: registration
// must succeed even if the OTP email fails to send, and — far more
// importantly — a booking that has already durably committed to
// Postgres must never be treated as failed just because an email
// provider hiccuped afterward. See how these functions are called (fire-
// and-forget, `.catch`-guarded) in authService.ts and bookingService.ts.
//
// Without RESEND_API_KEY configured, every "send" instead logs the full
// email content to the console — the same graceful-degradation pattern
// already used for OMDb (services/externalMovieService.ts): a missing
// third-party credential shrinks a feature's real-world usefulness, it
// never breaks the feature's calling code or the app's boot.

const resend = env.resendApiKey ? new Resend(env.resendApiKey) : null;

async function send(to: string, subject: string, html: string, attachments?: { filename: string; content: Buffer }[]) {
  if (!resend) {
    console.log(`\n[email:mock] To: ${to}\n[email:mock] Subject: ${subject}\n[email:mock] Body:\n${html}\n`);
    return;
  }
  try {
    const { error } = await resend.emails.send({
      from: env.emailFrom,
      to,
      subject,
      html,
      attachments,
    });
    if (error) console.error(`[email] Resend rejected the send to ${to}:`, error);
  } catch (err) {
    // Deliberately swallowed (logged, not thrown) — see the module
    // comment above for why callers must never have to handle this.
    console.error(`[email] Failed to send to ${to}:`, err);
  }
}

export async function sendOtpEmail(to: string, name: string, otp: string): Promise<void> {
  await send(
    to,
    "Verify your ShowTime email",
    `<div style="font-family:sans-serif;max-width:480px;margin:0 auto">
      <h2>Hi ${escapeHtml(name)},</h2>
      <p>Your ShowTime verification code is:</p>
      <p style="font-size:32px;font-weight:bold;letter-spacing:8px;text-align:center">${otp}</p>
      <p>This code expires in 10 minutes.</p>
    </div>`,
  );
}

export async function sendPasswordResetEmail(to: string, name: string, otp: string): Promise<void> {
  await send(
    to,
    "Reset your ShowTime password",
    `<div style="font-family:sans-serif;max-width:480px;margin:0 auto">
      <h2>Hi ${escapeHtml(name)},</h2>
      <p>Your ShowTime password reset code is:</p>
      <p style="font-size:32px;font-weight:bold;letter-spacing:8px;text-align:center">${otp}</p>
      <p>This code expires in 10 minutes. If you didn't request this, you can safely ignore this email — your password won't be changed.</p>
    </div>`,
  );
}

export async function sendBookingTicketEmail(to: string, booking: BookingDTO): Promise<void> {
  const seatLabels = booking.seats.map((s) => s.label).join(", ");
  const showTime = new Date(booking.showStartTime).toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short",
  });

  // The QR encodes the same compact plain-text ticket payload the web
  // app renders client-side (see apps/web/src/components/TicketQRCode.tsx)
  // — kept identical on purpose so a printed/emailed ticket and the
  // in-app one scan to the same thing.
  const qrPayload = [
    "ShowTime Ticket",
    `Ref: ${booking.reference}`,
    `Movie: ${booking.movieTitle}`,
    `Seats: ${seatLabels}`,
    `Show: ${showTime}`,
  ].join("\n");
  const qrPngDataUrl = await QRCode.toDataURL(qrPayload, { margin: 1, width: 240 });
  const qrPngBuffer = Buffer.from(qrPngDataUrl.split(",")[1], "base64");

  // Resend's attachments API doesn't support the traditional SMTP
  // `Content-ID`/`cid:` mechanism for referencing an attachment inline
  // inside the HTML body — so the QR is embedded directly as a base64
  // data: URI in the <img> tag (renders inline in most clients) AND
  // attached as a regular file (so it's still available even in clients,
  // like some webmail providers, that strip data: URIs from HTML email).
  const html = `<div style="font-family:sans-serif;max-width:480px;margin:0 auto">
    <h2>Your ShowTime ticket is confirmed</h2>
    <table style="width:100%;border-collapse:collapse;margin:16px 0">
      <tr><td style="color:#666;padding:4px 0">Reference</td><td style="font-weight:bold">${escapeHtml(booking.reference)}</td></tr>
      <tr><td style="color:#666;padding:4px 0">Movie</td><td>${escapeHtml(booking.movieTitle)}</td></tr>
      <tr><td style="color:#666;padding:4px 0">Theatre</td><td>${escapeHtml(booking.theatreName)} — ${escapeHtml(booking.screenName)}</td></tr>
      <tr><td style="color:#666;padding:4px 0">Showtime</td><td>${showTime}</td></tr>
      <tr><td style="color:#666;padding:4px 0">Seats</td><td>${escapeHtml(seatLabels)}</td></tr>
      <tr><td style="color:#666;padding:4px 0">Total paid</td><td>₹${booking.totalAmount}</td></tr>
    </table>
    <p>Scan this at the theatre (also attached as ticket-qr.png):</p>
    <img src="${qrPngDataUrl}" alt="Ticket QR code" width="240" height="240" />
  </div>`;

  await send(to, `Your ticket for ${booking.movieTitle} — ${booking.reference}`, html, [
    { filename: "ticket-qr.png", content: qrPngBuffer },
  ]);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
