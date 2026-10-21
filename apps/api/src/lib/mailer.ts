import nodemailer, { type Transporter } from 'nodemailer';
import type { Config } from '../config';
import { logger } from '../logger';

export interface Mail {
  to: string;
  subject: string;
  html: string;
  text: string;
}
export interface Mailer {
  send(mail: Mail): Promise<void>;
  /** test hook: every message sent in this process */
  outbox: Mail[];
}

export function createMailer(config: Config): Mailer {
  const outbox: Mail[] = [];
  let transport: Transporter | null = null;
  if (config.SMTP_URL) transport = nodemailer.createTransport(config.SMTP_URL);
  return {
    outbox,
    async send(mail) {
      if (config.isTest) outbox.push(mail);
      if (!transport) {
        logger.info({ to: mail.to, subject: mail.subject }, 'email (SMTP not configured, not sent)');
        return;
      }
      try {
        await transport.sendMail({ from: config.MAIL_FROM, ...mail });
      } catch (err) {
        logger.error({ err, to: mail.to, subject: mail.subject }, 'email failed');
      }
    },
  };
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
export function layout(title: string, bodyHtml: string, cta?: { label: string; href: string }) {
  return `<!doctype html><html><body style="margin:0;background:#F7F4EE;font-family:Inter,Arial,sans-serif;color:#080808">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 12px">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;max-width:100%"><tr><td style="padding:28px 32px;border-bottom:1px solid #D8C9B5;font:600 20px Georgia,serif;letter-spacing:.14em">CITY ROYALTY</td></tr>
<tr><td style="padding:32px"><h1 style="font:400 26px Georgia,serif;margin:0 0 16px">${esc(title)}</h1>${bodyHtml}
${cta ? `<p style="margin:28px 0 0"><a href="${esc(cta.href)}" style="background:#080808;color:#fff;padding:14px 26px;text-decoration:none;font-size:13px;letter-spacing:.12em;text-transform:uppercase">${esc(cta.label)}</a></p>` : ''}
</td></tr><tr><td style="padding:20px 32px;font-size:12px;color:#6b5a4c;border-top:1px solid #D8C9B5">City Royalty · Wear a higher standard.</td></tr></table></td></tr></table></body></html>`;
}
export { esc as escapeHtml };
