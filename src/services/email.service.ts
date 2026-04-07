import { BrevoClient } from "@getbrevo/brevo";

const brevo = new BrevoClient({ apiKey: process.env.BREVO_API_KEY ?? "" });

const sender = () => ({
  name: process.env.EMAIL_FROM_NAME ?? "Scrivener",
  email: process.env.EMAIL_FROM_ADDRESS ?? "",
});

// Helper for the logo header
const headerHtml = `
  <div style="text-align: center; padding: 24px 0;">
    <h1 style="color: #141C23; margin: 0; font-size: 24px; font-weight: bold; letter-spacing: -0.5px;">Scrivener</h1>
  </div>
`;

// Helper for the footer text
const footerHtml = (requesterName?: string) => `
  <div style="font-size: 12px; color: #5E788D; line-height: 1.5;">
    <p style="margin: 0 0 4px; font-weight: bold; color: #141C23;">Do Not Share This Email</p>
    <p style="margin: 0 0 16px;">This email contains a secure link to Scrivener. Please do not share this email or link with others.</p>
    <p style="margin: 0 0 16px;">Copyright &copy; ${new Date().getFullYear()} Scrivener. All rights reserved.</p>
    ${requesterName ? `<p style="margin: 0;">This message was sent to you by ${requesterName}. If you would rather not receive email from this sender you may contact the sender with your request.</p>` : ""}
  </div>
`;

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
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #141C23;">
        ${headerHtml}
        <div style="background: #141C23; border-radius: 8px 8px 0 0; padding: 40px 20px; text-align: center; color: #FFFFFF;">
          <p style="font-size: 18px; margin: 0 0 16px; font-weight: bold;">Password Reset</p>
          <p style="font-size: 14px; margin: 0; color: #D9E4EE;">Use the code below to reset your password. It expires in ${expiryMinutes} minutes.</p>
        </div>
        <div style="background: #FFFFFF; border: 1px solid #D9E4EE; border-top: none; border-radius: 0 0 8px 8px; padding: 40px 24px; margin-bottom: 32px; text-align: center;">
          <div style="background: #F8F8F8; border-radius: 8px; padding: 20px; display: inline-block;">
             <span style="font-size: 36px; font-weight: bold; letter-spacing: 12px; color: #279EFF;">${otpCode}</span>
          </div>
        </div>
        ${footerHtml()}
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
  requesterEmail?: string,
  message?: string,
): Promise<void> => {
  await brevo.transactionalEmails.sendTransacEmail({
    sender: sender(),
    to: [{ email: toEmail }],
    subject: `${requesterName} sent you a document to review and sign`,
    htmlContent: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #141C23;">
        ${headerHtml}
        
        <div style="background: #141C23; border-radius: 8px 8px 0 0; padding: 40px 32px; text-align: center; color: #FFFFFF;">
          <div style="background: #FFFFFF; width: 48px; height: 48px; border-radius: 8px; margin: 0 auto 24px; display: flex; align-items: center; justify-content: center; line-height: 48px;">
            <span style="font-size: 24px; color: #141C23;">&#x270E;</span>
          </div>
          <p style="font-size: 16px; margin: 0 0 24px;">${requesterName} sent you a document to review and sign.</p>
          <a href="${signingUrl}" style="display: inline-block; background: #279EFF; color: #FFFFFF; font-weight: bold; text-decoration: none; padding: 14px 32px; border-radius: 4px; font-size: 16px;">Review Document</a>
        </div>
        
        <div style="background: #FFFFFF; border: 1px solid #D9E4EE; border-top: none; border-radius: 0 0 8px 8px; padding: 32px 32px; margin-bottom: 32px;">
          <p style="margin: 0 0 4px; font-weight: bold; font-size: 15px;">${requesterName}</p>
          ${requesterEmail ? '<p style="margin: 0 0 24px;"><a href="mailto:' + requesterEmail + '" style="color: #279EFF; text-decoration: none; font-size: 14px;">' + requesterEmail + '</a></p>' : '<div style="margin-bottom: 24px;"></div>'}
          ${message ? '<p style="margin: 0; font-size: 14px; line-height: 1.5;">' + message + '</p>' : '<p style="margin: 0; font-size: 14px; line-height: 1.5;">Please review and sign ' + documentName + '.</p>'}
        </div>
        
        ${footerHtml(requesterName)}
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
    subject: "You've been added as a copy recipient",
    htmlContent: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #141C23;">
        ${headerHtml}
        
        <div style="background: #141C23; border-radius: 8px 8px 0 0; padding: 40px 32px; text-align: center; color: #FFFFFF;">
          <div style="background: #FFFFFF; width: 48px; height: 48px; border-radius: 8px; margin: 0 auto 24px; display: flex; align-items: center; justify-content: center; line-height: 48px;">
            <span style="font-size: 24px; color: #141C23;">&#x1F4C4;</span>
          </div>
          <p style="font-size: 16px; margin: 0 0 8px;">${requesterName} added you as a copy recipient.</p>
          <p style="font-size: 14px; color: #D9E4EE; margin: 0;">You will receive the signed copy of <strong>${documentName}</strong> once all signatures are completed.</p>
        </div>
        
        <div style="background: #FFFFFF; border: 1px solid #D9E4EE; border-top: none; border-radius: 0 0 8px 8px; padding: 8px; margin-bottom: 32px;">
        </div>
        
        ${footerHtml(requesterName)}
      </div>
    `,
  });
};
