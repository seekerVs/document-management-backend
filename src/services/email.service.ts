import { BrevoClient } from "@getbrevo/brevo";

const brevo = new BrevoClient({ apiKey: process.env.BREVO_API_KEY ?? "" });

const sender = () => ({
  name: process.env.EMAIL_FROM_NAME ?? "Scrivener",
  email: process.env.EMAIL_FROM_ADDRESS ?? "",
});

// Send OTP email for password reset
export const sendOtpEmail = async (
  toEmail: string,
  otpCode: string,
  expiryMinutes: number,
): Promise<void> => {
  await brevo.transactionalEmails.sendTransacEmail({
    sender: sender(),
    to: [{ email: toEmail }],
    subject: "Your password reset code",
    htmlContent: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #279EFF;">Password Reset</h2>
        <p>Use the code below to reset your password. It expires in <strong>${expiryMinutes} minutes</strong>.</p>
        <div style="background: #ECF1F7; border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0;">
          <span style="font-size: 36px; font-weight: bold; letter-spacing: 12px; color: #279EFF;">${otpCode}</span>
        </div>
        <p style="color: #5E788D; font-size: 14px;">If you did not request a password reset, please ignore this email.</p>
      </div>
    `,
  });
};

// Send signing link email to a signer
export const sendSigningLinkEmail = async (
  toEmail: string,
  signerName: string,
  requesterName: string,
  documentName: string,
  signingUrl: string,
): Promise<void> => {
  await brevo.transactionalEmails.sendTransacEmail({
    sender: sender(),
    to: [{ email: toEmail }],
    subject: `${requesterName} requested your signature`,
    htmlContent: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #279EFF;">Signature Requested</h2>
        <p>Hi ${signerName || "there"},</p>
        <p><strong>${requesterName}</strong> has requested your signature on:</p>
        <p style="background: #ECF1F7; border-radius: 8px; padding: 12px 16px; font-weight: bold; color: #141C23;">${documentName}</p>
        <a href="${signingUrl}" style="display: inline-block; background: #279EFF; color: white; text-decoration: none; padding: 14px 28px; border-radius: 12px; font-size: 16px; margin: 24px 0;">Review &amp; Sign</a>
        <p style="color: #5E788D; font-size: 13px;">This link expires in 72 hours. No account required.</p>
      </div>
    `,
  });
};

// Send copy notification email — no signing link
export const sendCopyEmail = async (
  toEmail: string,
  recipientName: string,
  requesterName: string,
  documentName: string,
): Promise<void> => {
  await brevo.transactionalEmails.sendTransacEmail({
    sender: sender(),
    to: [{ email: toEmail }],
    subject: `You've been added as a copy recipient`,
    htmlContent: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #279EFF;">Document Copy</h2>
        <p>Hi ${recipientName || "there"},</p>
        <p><strong>${requesterName}</strong> has added you as a copy recipient on:</p>
        <p style="background: #ECF1F7; border-radius: 8px; padding: 12px 16px; font-weight: bold; color: #141C23;">${documentName}</p>
        <p style="color: #5E788D; font-size: 13px;">You will receive the signed copy once all signatures are completed.</p>
      </div>
    `,
  });
};
