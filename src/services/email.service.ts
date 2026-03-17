import { Resend } from "resend";

// src/Services/email.service.ts

const getResend = () => new Resend(process.env.RESEND_API_KEY);

// ─── OTP email ───────────────────────────────────────────────────────────────

export const sendOtpEmail = async (
  toEmail: string,
  otpCode: string,
  expiryMinutes: number,
): Promise<void> => {
  const fromName = process.env.EMAIL_FROM_NAME ?? "Document Management";
  const fromAddress = process.env.EMAIL_FROM_ADDRESS ?? "onboarding@resend.dev";

  await getResend().emails.send({
    from: `${fromName} <${fromAddress}>`,
    to: toEmail,
    subject: "Your password reset code",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #0066FF;">Password Reset</h2>
        <p>Use the code below to reset your password. It expires in <strong>${expiryMinutes} minutes</strong>.</p>
        <div style="
          background: #f4f4f4;
          border-radius: 12px;
          padding: 24px;
          text-align: center;
          margin: 24px 0;
        ">
          <span style="
            font-size: 36px;
            font-weight: bold;
            letter-spacing: 12px;
            color: #0066FF;
          ">${otpCode}</span>
        </div>
        <p style="color: #666; font-size: 14px;">
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
  const fromName = process.env.EMAIL_FROM_NAME ?? "Document Management";
  const fromAddress = process.env.EMAIL_FROM_ADDRESS ?? "onboarding@resend.dev";

  await getResend().emails.send({
    from: `${fromName} <${fromAddress}>`,
    to: toEmail,
    subject: `${requesterName} requested your signature`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #0066FF;">Signature Requested</h2>
        <p>Hi ${signerName || "there"},</p>
        <p><strong>${requesterName}</strong> has requested your signature on:</p>
        <p style="
          background: #f4f4f4;
          border-radius: 8px;
          padding: 12px 16px;
          font-weight: bold;
        ">${documentName}</p>
        <a href="${signingUrl}" style="
          display: inline-block;
          background: #0066FF;
          color: white;
          text-decoration: none;
          padding: 14px 28px;
          border-radius: 40px;
          font-size: 16px;
          margin: 24px 0;
        ">Review &amp; Sign</a>
        <p style="color: #666; font-size: 13px;">
          This link expires in 72 hours. No account required.
        </p>
      </div>
    `,
  });
};
