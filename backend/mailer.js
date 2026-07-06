/**
 * Email delivery for booking PDFs, via the cpgh.in SMTP mail server.
 *
 * All connection details come from backend/.env (see .env.example):
 *   SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS,
 *   MAIL_FROM, MAIL_RECIPIENTS
 *
 * If SMTP is not configured, sending is skipped with a warning so that
 * booking creation itself never fails because of mail problems.
 */

const nodemailer = require('nodemailer');
const dns = require('dns').promises;
const net = require('net');
const { renderBookingPdf } = require('./pdf');

const RECIPIENTS = (process.env.MAIL_RECIPIENTS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

let transporter = null;

function isConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && RECIPIENTS.length);
}

async function getTransporter() {
  if (transporter) return transporter;

  const smtpHost = process.env.SMTP_HOST;

  // Force IPv4. Many hosts (Railway, Vercel, Render's free tier) have an IPv6
  // network interface but no route to the IPv6 internet. nodemailer 9 resolves
  // the SMTP host with dns.resolve4 + dns.resolve6 and then picks one address at
  // *random*, so whenever it lands on an AAAA record the connection dies with
  // `connect ENETUNREACH <ipv6>`. Resolving to an IPv4 literal ourselves makes
  // nodemailer skip its resolver entirely; tls.servername keeps SNI and TLS
  // certificate validation working against the original hostname.
  let connectHost = smtpHost;
  if (smtpHost && !net.isIP(smtpHost)) {
    try {
      const [ipv4] = await dns.resolve4(smtpHost);
      if (ipv4) connectHost = ipv4;
    } catch (err) {
      console.warn(`[mail] IPv4 resolve of ${smtpHost} failed (${err.message}); using hostname as-is.`);
    }
  }

  transporter = nodemailer.createTransport({
    host: connectHost,
    port: Number(process.env.SMTP_PORT || 587),
    // secure=true for port 465 (implicit TLS); false uses STARTTLS on 587.
    secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    tls: { servername: smtpHost },
  });
  return transporter;
}

/**
 * Generate the booking PDF and email it to the internal distribution list.
 * Resolves to a summary; never throws (errors are caught and logged) so the
 * caller can fire-and-forget without risking an unhandled rejection.
 *
 * @param {object} booking  a plain booking object (Booking.toJSON()).
 */
async function sendBookingEmail(booking) {
  const series = booking.series_no || String(booking.id ?? booking.seq ?? '');
  if (!isConfigured()) {
    console.warn(
      `[mail] SMTP not configured — skipped emailing booking ${series}. ` +
        'Set SMTP_HOST/SMTP_USER/SMTP_PASS and MAIL_RECIPIENTS in backend/.env.'
    );
    return { sent: false, reason: 'not-configured' };
  }

  try {
    const pdf = await renderBookingPdf(booking);
    const fileName = `Booking-${series}-${(booking.party_name || 'party')
      .replace(/[^\w\-]+/g, '_')
      .slice(0, 40)}.pdf`;

    const info = await (await getTransporter()).sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      to: RECIPIENTS,
      subject: `Function Booking ${series} — ${booking.party_name || ''} (${booking.date || ''})`.trim(),
      text: bookingSummaryText(booking, series),
      attachments: [{ filename: fileName, content: pdf, contentType: 'application/pdf' }],
    });

    console.log(`[mail] Booking ${series} emailed to ${RECIPIENTS.length} recipients (id: ${info.messageId})`);
    return { sent: true, messageId: info.messageId, recipients: RECIPIENTS.length };
  } catch (err) {
    console.error(`[mail] Failed to email booking ${series}: ${err.message}`);
    return { sent: false, reason: err.message };
  }
}

function bookingSummaryText(b, series) {
  const line = (label, v) => (v ? `${label}: ${v}` : null);
  return [
    `A new function booking has been recorded at Centre Point Amravti.`,
    ``,
    line('Booking No', series),
    line('Reservation No', b.reservation_no),
    line('Date', b.date),
    line('Time', b.time),
    line('Type', b.function_type),
    line('Venue', b.venue),
    line('Time Slot', b.time_slot),
    line('Expected Pax', b.expected_pax),
    line('Party', b.party_name),
    line('Company', b.company_name),
    line('Contact', b.contact_person),
    line('Telephone', b.telephone),
    line('Submitted by', b.submitted_by),
    ``,
    `The full details are attached as a PDF.`,
  ]
    .filter((l) => l !== null)
    .join('\n');
}

module.exports = { sendBookingEmail, isConfigured, RECIPIENTS };
