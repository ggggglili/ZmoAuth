import nodemailer from "nodemailer";
import { AppError } from "@/lib/errors";
import { getSmtpDeliverySettings } from "@/lib/services/system-settings.service";

export async function sendSmtpMail(input: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}) {
  const smtp = await getSmtpDeliverySettings();
  if (!smtp) {
    throw new AppError("VALIDATION_ERROR", "SMTP is not configured or disabled.", 400);
  }

  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: {
      user: smtp.username,
      pass: smtp.password,
    },
  });

  await transporter.sendMail({
    from: `"${smtp.fromName}" <${smtp.fromEmail}>`,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
  });
}
