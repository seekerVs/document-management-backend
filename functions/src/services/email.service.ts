import { BrevoClient } from "@getbrevo/brevo";
import { environment } from "../config/environment.js";

const brevo = new BrevoClient({ apiKey: environment.brevoApiKey });

const sender = () => ({
  name: environment.emailFromName,
  email: environment.emailFromAddress,
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
    ${requesterName ? `<p style="margin: 0;">This message is sent to you byy ${requesterName}. If you would rather not receive email from this sender you may contact the sender with your request.</p>` : ""}
  </div>
`;

// Send OTP email for password reset
export const sendOtpEmail = async (
  toEmail: string,
  otpCode: string,
  expiryMinutes: number
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
  message?: string
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
            <img src="data:image/png;base64,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" alt="Scrivener Logo" style="width: 48px; height: auto;"/>
          </div>
          <p style="font-size: 16px; margin: 0 0 24px;">${requesterName} sent you a document to review and sign.</p>
          <a href="${signingUrl}" style="display: inline-block; background: #279EFF; color: #FFFFFF; font-weight: bold; text-decoration: none; padding: 14px 32px; border-radius: 4px; font-size: 16px;">Review Document</a>
        </div>
        
        <div style="background: #FFFFFF; border: 1px solid #D9E4EE; border-top: none; border-radius: 0 0 8px 8px; padding: 32px 32px; margin-bottom: 32px;">
          <p style="margin: 0 0 4px; font-weight: bold; font-size: 15px;">${requesterName}</p>
          ${requesterEmail ? '<p style="margin: 0 0 24px;"><a href="mailto:' + requesterEmail + '" style="color: #279EFF; text-decoration: none; font-size: 14px;">' + requesterEmail + "</a></p>" : '<div style="margin-bottom: 24px;"></div>'}
          ${message ? '<p style="margin: 0; font-size: 14px; line-height: 1.5;">' + message + "</p>" : '<p style="margin: 0; font-size: 14px; line-height: 1.5;">Please review and sign ' + documentName + ".</p>"}
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
  documentName: string
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

// Send completed document link email
export const sendDocumentCompletedEmail = async (
  toEmail: string,
  recipientName: string,
  requesterName: string,
  documentName: string,
  completedUrl: string
): Promise<void> => {
  await brevo.transactionalEmails.sendTransacEmail({
    sender: sender(),
    to: [{ email: toEmail }],
    subject: `Document Completed: ${documentName}`,
    htmlContent: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #141C23;">
        ${headerHtml}
        
        <div style="background: #141C23; border-radius: 8px 8px 0 0; padding: 40px 32px; text-align: center; color: #FFFFFF;">
          <div style="background: #FFFFFF; width: 48px; height: 48px; border-radius: 8px; margin: 0 auto 24px; display: flex; align-items: center; justify-content: center; line-height: 48px;">
            <span style="font-size: 24px;">&#x2705;</span>
          </div>
          <p style="font-size: 16px; margin: 0 0 24px;">The document <strong>${documentName}</strong> has been fully signed and is now complete.</p>
          <a href="${completedUrl}" style="display: inline-block; background: #279EFF; color: #FFFFFF; font-weight: bold; text-decoration: none; padding: 14px 32px; border-radius: 4px; font-size: 16px;">View Completed Document</a>
        </div>
        
        <div style="background: #FFFFFF; border: 1px solid #D9E4EE; border-top: none; border-radius: 0 0 8px 8px; padding: 32px 32px; margin-bottom: 32px;">
          <p style="margin: 0; font-size: 14px; line-height: 1.5;">You can now view and download the final version of the document for your records.</p>
        </div>
        
        ${footerHtml(requesterName)}
      </div>
    `,
  });
};
