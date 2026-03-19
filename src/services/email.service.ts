import nodemailer from "nodemailer";

// 📁 src/Services/email.service.ts
//

const createTransporter = () =>
  nodemailer.createTransport({
    host: process.env.BREVO_SMTP_HOST ?? "smtp-relay.brevo.com",
    port: Number(process.env.BREVO_SMTP_PORT ?? 587),
    secure: false, // TLS via STARTTLS
    auth: {
      user: process.env.BREVO_SMTP_USER ?? "",
      pass: process.env.BREVO_SMTP_PASS ?? "",
    },
  });

const fromAddress = () =>
  `"${process.env.EMAIL_FROM_NAME ?? "Scrivener"}" <${process.env.EMAIL_FROM_ADDRESS ?? process.env.BREVO_SMTP_USER}>`;

// ─── OTP email ────────────────────────────────────────────────────────────────

export const sendOtpEmail = async (
  toEmail: string,
  otpCode: string,
  expiryMinutes: number,
): Promise<void> => {
  await createTransporter().sendMail({
    from: fromAddress(),
    to: toEmail,
    subject: "Your password reset code",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #1A73E8;">Password Reset</h2>
        <p>Use the code below to reset your password. It expires in <strong>${expiryMinutes} minutes</strong>.</p>
        <div style="
          background: #ECF1F7;
          border-radius: 12px;
          padding: 24px;
          text-align: center;
          margin: 24px 0;
        ">
          <span style="
            font-size: 36px;
            font-weight: bold;
            letter-spacing: 12px;
            color: #1A73E8;
          ">${otpCode}</span>
        </div>
        <p style="color: #5E788D; font-size: 14px;">
          If you did not request a password reset, please ignore this email.
        </p>
      </div>
    `,
  });
};

// ─── Signing link email ───────────────────────────────────────────────────────

export const sendSigningLinkEmail = async (
  toEmail: string,
  signerName: string,
  requesterName: string,
  documentName: string,
  signingUrl: string,
): Promise<void> => {
  await createTransporter().sendMail({
    from: fromAddress(),
    to: toEmail,
    subject: `${requesterName} requested your signature`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #1A73E8;">Signature Requested</h2>
        <p>Hi ${signerName || "there"},</p>
        <p><strong>${requesterName}</strong> has requested your signature on:</p>
        <p style="
          background: #ECF1F7;
          border-radius: 8px;
          padding: 12px 16px;
          font-weight: bold;
          color: #141C23;
        ">${documentName}</p>
        <a href="${signingUrl}" style="
          display: inline-block;
          background: #1A73E8;
          color: white;
          text-decoration: none;
          padding: 14px 28px;
          border-radius: 40px;
          font-size: 16px;
          margin: 24px 0;
        ">Review &amp; Sign</a>
        <p style="color: #5E788D; font-size: 13px;">
          This link expires in 72 hours. No account required.
        </p>
      </div>
    `,
  });
};
