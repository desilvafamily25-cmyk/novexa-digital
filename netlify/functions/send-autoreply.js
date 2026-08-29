// Netlify Function: sends an instant auto-reply to the person who submitted
// the NOVEXA DIGITAL contact form, using Zoho SMTP.
//
// Triggered by a Netlify Forms "Outgoing webhook" notification (configured
// in the Netlify UI, not in code) pointing at:
//   https://novexadigital.com.au/.netlify/functions/send-autoreply
//
// Required environment variables (set in Netlify site settings → Environment variables):
//   ZOHO_SMTP_USER  e.g. hello@novexadigital.com.au
//   ZOHO_SMTP_PASS  a Zoho "Application Password" (NOT the normal login password)
//   ZOHO_SMTP_HOST  optional, defaults to smtp.zoho.com.au
//
// This function fails silently from the client's point of view (Netlify Forms
// has already accepted the submission regardless of this function's outcome),
// but logs errors to the Netlify Functions log for troubleshooting.

const nodemailer = require('nodemailer');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch (err) {
    console.error('send-autoreply: could not parse webhook body', err);
    return { statusCode: 400, body: 'Bad request' };
  }

  const data = payload && payload.data ? payload.data : {};
  const formName = data['form-name'] || payload.form_name;

  // Only auto-reply to the project enquiry form, and only if it looks real
  // (Netlify's own spam filter usually blocks bots before this fires, but
  // the honeypot field is checked again here as a second guard).
  if (formName !== 'project-enquiry') {
    return { statusCode: 200, body: 'Ignored: not the enquiry form' };
  }
  if (data['company-website']) {
    console.warn('send-autoreply: honeypot filled, treating as spam, skipping');
    return { statusCode: 200, body: 'Ignored: honeypot triggered' };
  }

  const toEmail = (data.email || '').trim();
  const name = (data.name || 'there').trim();

  if (!toEmail || !toEmail.includes('@')) {
    console.error('send-autoreply: no valid submitter email in payload');
    return { statusCode: 200, body: 'Ignored: no valid email' };
  }

  const SMTP_USER = process.env.ZOHO_SMTP_USER;
  const SMTP_PASS = process.env.ZOHO_SMTP_PASS;
  const SMTP_HOST = process.env.ZOHO_SMTP_HOST || 'smtp.zoho.com.au';

  if (!SMTP_USER || !SMTP_PASS) {
    console.error('send-autoreply: ZOHO_SMTP_USER / ZOHO_SMTP_PASS not configured');
    return { statusCode: 200, body: 'Skipped: SMTP not configured' };
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: 465,
    secure: true,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  const firstName = name.split(' ')[0];

  const text = `Hi ${firstName},

Thanks for reaching out to NOVEXA DIGITAL — we've received your enquiry and a real person will reply personally within one business day (usually much sooner).

In the meantime, here's a quick look at our website packages so you have context before we speak: https://novexadigital.com.au/services/

If anything is urgent, you can also reply directly to this email.

Best,
NOVEXA DIGITAL
hello@novexadigital.com.au
https://novexadigital.com.au

--
This is an automated acknowledgement. Your message has been received and a team member will follow up personally.`;

  const html = `<div style="font-family:Georgia,'Times New Roman',serif;color:#071b22;max-width:560px;margin:0 auto">
<p>Hi ${firstName},</p>
<p>Thanks for reaching out to <strong>NOVEXA DIGITAL</strong> — we've received your enquiry and a real person will reply personally within one business day (usually much sooner).</p>
<p>In the meantime, here's a quick look at our website packages so you have context before we speak:
<br><a href="https://novexadigital.com.au/services/" style="color:#2e756f">novexadigital.com.au/services</a></p>
<p>If anything is urgent, you can also reply directly to this email.</p>
<p>Best,<br>NOVEXA DIGITAL<br>
<a href="mailto:hello@novexadigital.com.au" style="color:#2e756f">hello@novexadigital.com.au</a><br>
<a href="https://novexadigital.com.au" style="color:#2e756f">novexadigital.com.au</a></p>
<hr style="border:none;border-top:1px solid #ddd;margin:1.5rem 0">
<p style="font-size:.78rem;color:#637378">This is an automated acknowledgement. Your message has been received and a team member will follow up personally.</p>
</div>`;

  try {
    await transporter.sendMail({
      from: `"NOVEXA DIGITAL" <${SMTP_USER}>`,
      to: toEmail,
      replyTo: SMTP_USER,
      subject: 'We\u2019ve received your enquiry — NOVEXA DIGITAL',
      text,
      html,
    });
    return { statusCode: 200, body: 'Auto-reply sent' };
  } catch (err) {
    console.error('send-autoreply: failed to send', err);
    // Return 200 so Netlify does not retry-storm on a persistent SMTP issue.
    return { statusCode: 200, body: 'Send failed, logged' };
  }
};
