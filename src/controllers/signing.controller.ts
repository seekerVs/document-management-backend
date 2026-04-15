import { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import * as admin from "firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getFirestore } from "../services/firebase.service.js";
import {
  sendCopyEmail,
  sendSigningLinkEmail,
} from "../services/email.service.js";
import { NotificationRepository } from "../services/notification.service.js";
import {
  ApiResponse,
  CreateSignatureRequestBody,
  SendSigningLinkRequest,
  SubmitSignatureRequest,
} from "../types/index.js";
import { downloadFromStorage } from "../services/supabase.service.js";
import { SignatureService } from "../services/signature.service.js";

const TOKEN_EXPIRY_HOURS = 72;
const BASE_URL = process.env.SIGNING_BASE_URL ?? "https://your-web-app.com";
const notifRepo = new NotificationRepository();
const signatureService = new SignatureService();

// Build guest signing URL from token
const buildSigningUrl = (token: string): string =>
  `${BASE_URL}/sign?token=${token}`;

// POST /api/signing/create-request
// Creates Firestore request, generates tokens, sends emails to all signers
export const createSignatureRequest = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const {
    requestedByUid,
    requesterName,
    documents,
    signers,
    signingOrderEnabled,
    message,
    requesterEmail,
  } = req.body as CreateSignatureRequestBody;

  try {
    const db = getFirestore();
    const requestId = uuidv4();
    const now = FieldValue.serverTimestamp();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + TOKEN_EXPIRY_HOURS);

    // Build signer list with tokens for needsToSign signers
    const signersWithTokens = signers.map((signer) => {
      if (signer.role !== "needsToSign") {
        return {
          ...signer,
          status: "pending",
          signingToken: null,
          tokenExpiry: null,
          tokenUsed: false,
        };
      }
      const token = uuidv4();
      return {
        ...signer,
        status: "pending",
        signingToken: token,
        tokenExpiry: Timestamp.fromDate(expiresAt),
        tokenUsed: false,
        signedAt: null,
        signatureImageUrl: null,
        ipAddress: null,
      };
    });

    // Write signature request to Firestore
    // signerEmails is a flat array for efficient arrayContains queries
    await db
      .collection("signature_requests")
      .doc(requestId)
      .set({
        requestId,
        requestedByUid,
        documents,
        documentId: documents[0].documentId, // For legacy compatibility
        documentName: documents[0].documentName,
        documentUrl: documents[0].documentUrl,
        storagePath: documents[0].storagePath,
        status: "pending",
        signingOrderEnabled,
        message: message ?? null,
        requesterEmail: requesterEmail ?? null,
        signers: signersWithTokens,
        signerEmails: signers.map((s) => s.signerEmail.trim().toLowerCase()),
        createdAt: now,
        updatedAt: now,
        completedAt: null,
      });

    // Store tokens in signing_tokens collection and send emails
    const emailPromises = signersWithTokens.map(async (signer) => {
      if (signer.role === "needsToSign" && signer.signingToken) {
        // Store token for guest web validation
        await db
          .collection("signing_tokens")
          .doc(signer.signingToken)
          .set({
            token: signer.signingToken,
            documentId: documents[0].documentId,
            requestId,
            signerEmail: signer.signerEmail.trim().toLowerCase(),
            expiresAt: Timestamp.fromDate(expiresAt),
            used: false,
            createdAt: now,
          });

        const emailDocName = documents.length > 1 
          ? `${documents[0].documentName} and ${documents.length - 1} other(s)` 
          : documents[0].documentName;

        // Send signing link email
        await sendSigningLinkEmail(
          signer.signerEmail,
          signer.signerName,
          requesterName,
          emailDocName,
          buildSigningUrl(signer.signingToken),
          requesterEmail,
          message,
        );
      } else if (signer.role === "receivesACopy") {
        const emailDocName = documents.length > 1 
          ? `${documents[0].documentName} and ${documents.length - 1} other(s)` 
          : documents[0].documentName;

        // Send copy notification — no token needed
        await sendCopyEmail(
          signer.signerEmail,
          signer.signerName,
          requesterName,
          emailDocName,
        );
      }
    });

    await Promise.all(emailPromises);

    res.status(200).json({
      success: true,
      message: "Signature request created and emails sent.",
      data: { requestId },
    } as ApiResponse<{ requestId: string }>);
  } catch (error) {
    console.error("[createSignatureRequest] Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create signature request.",
    } as ApiResponse);
  }
};

// POST /api/signing/send-link
// Sends a single signing link — used for resending to a specific signer
export const sendSigningLink = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const {
    documentId,
    requestId,
    signerEmail,
    signerName,
    requesterName,
    documentName,
    requesterEmail,
    message,
  } = req.body as SendSigningLinkRequest;

  try {
    const db = getFirestore();
    const token = uuidv4();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + TOKEN_EXPIRY_HOURS);

    await db
      .collection("signing_tokens")
      .doc(token)
      .set({
        token,
        documentId,
        requestId,
        signerEmail: signerEmail.trim().toLowerCase(),
        expiresAt: Timestamp.fromDate(expiresAt),
        used: false,
        createdAt: FieldValue.serverTimestamp(),
      });

    await sendSigningLinkEmail(
      signerEmail.trim(),
      signerName ?? "",
      requesterName,
      documentName,
      buildSigningUrl(token),
      requesterEmail,
      message,
    );

    res.status(200).json({
      success: true,
      message: "Signing link sent successfully.",
      data: { token },
    } as ApiResponse<{ token: string }>);
  } catch (error) {
    console.error("[sendSigningLink] Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to send signing link.",
    } as ApiResponse);
  }
};

// GET /api/signing/validate-token?token=xxx
// Called by Flutter web to validate token on page load
export const validateToken = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { token } = req.query;

  if (!token || typeof token !== "string") {
    res.status(400).json({
      success: false,
      message: "Token is required.",
    } as ApiResponse);
    return;
  }

  try {
    const db = getFirestore();
    const doc = await db.collection("signing_tokens").doc(token).get();

    if (!doc.exists) {
      res.status(404).json({
        success: false,
        message: "Invalid signing link.",
      } as ApiResponse);
      return;
    }

    const data = doc.data()!;

    if (data.used) {
      res.status(400).json({
        success: false,
        message: "This signing link has already been used.",
      } as ApiResponse);
      return;
    }

    if (new Date() > data.expiresAt.toDate()) {
      res.status(400).json({
        success: false,
        message: "This signing link has expired.",
      } as ApiResponse);
      return;
    }

    res.status(200).json({
      success: true,
      message: "Token is valid.",
      data: {
        documentId: data.documentId,
        requestId: data.requestId,
        signerEmail: data.signerEmail,
      },
    } as ApiResponse<{
      documentId: string;
      requestId: string;
      signerEmail: string;
    }>);
  } catch (error) {
    console.error("[validateToken] Error:", error);
    res.status(500).json({
      success: false,
      message: "Token validation failed.",
    } as ApiResponse);
  }
};

// POST /api/signing/expire-requests — called by Render cron job daily
export const expireRequests = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const db = getFirestore();
    const now = new Date();

    const snap = await db
      .collection("signature_requests")
      .where("status", "in", ["pending", "inProgress"])
      .get();

    let expiredCount = 0;

    for (const doc of snap.docs) {
      const data = doc.data();
      const signers: any[] = data.signers ?? [];

      // Check if any pending signer token is expired
      const hasExpiredToken = signers.some(
        (s) =>
          s.role === "needsToSign" &&
          s.status === "pending" &&
          s.tokenExpiry &&
          s.tokenExpiry.toDate() < now,
      );

      if (!hasExpiredToken) continue;

      await doc.ref.update({
        status: "expired",
        updatedAt: FieldValue.serverTimestamp(),
      });

      // Notify owner
      await notifRepo.createNotification({
        recipientUid: data.requestedByUid,
        type: "tokenExpired",
        title: "Signing request expired",
        body: `The signing request for ${data.documentName} has expired.`,
        requestId: doc.id,
        documentName: data.documentName,
      });

      expiredCount++;
    }

    res.status(200).json({
      success: true,
      message: `${expiredCount} request(s) expired.`,
      data: { expiredCount },
    } as ApiResponse<{ expiredCount: number }>);
  } catch (error) {
    console.error("[expireRequests] Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to process expired requests.",
    } as ApiResponse);
  }
};

// POST /api/signing/submit-signature
// Authenticated submission from mobile app
export const submitSignature = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const {
    requestId,
    signerEmail,
    signerName,
    updatedFields,
    signatureImageUrl,
    signerUid,
  } = req.body as SubmitSignatureRequest;

  try {
    await signatureService.processSubmission({
      requestId,
      signerEmail,
      signerName,
      updatedFields,
      signatureImageUrl,
      signerUid: signerUid ?? (req as any).user?.uid,
    });

    res.status(200).json({
      success: true,
      message: "Signature submitted successfully.",
    });
  } catch (error: any) {
    console.error("[submitSignature] Error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to submit signature.",
    });
  }
};
// GET /api/v1/guest/request-details?token=xxx
export const getGuestRequestDetails = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { token } = req.query;

  if (!token || typeof token !== "string") {
    res.status(400).json({ success: false, message: "Token is required." });
    return;
  }

  try {
    const db = getFirestore();
    // 1. Validate Token
    const tokenDoc = await db.collection("signing_tokens").doc(token).get();

    if (!tokenDoc.exists) {
      res
        .status(404)
        .json({ success: false, message: "Invalid signing link." });
      return;
    }

    const tokenData = tokenDoc.data()!;
    if (tokenData.used) {
      res
        .status(400)
        .json({ success: false, message: "This link has already been used." });
      return;
    }

    if (new Date() > tokenData.expiresAt.toDate()) {
      res
        .status(400)
        .json({ success: false, message: "This link has expired." });
      return;
    }

    // 2. Fetch Request Details
    const requestDoc = await db
      .collection("signature_requests")
      .doc(tokenData.requestId)
      .get();
    if (!requestDoc.exists) {
      res
        .status(404)
        .json({ success: false, message: "Signature request not found." });
      return;
    }

    const requestData = requestDoc.data()!;

    // 3. Prepare response data
    res.status(200).json({
      success: true,
      id: requestDoc.id, // Frontend expects id here
      data: {
        documents: requestData.documents || [
          {
            documentId: requestData.documentId,
            documentName: requestData.documentName,
            documentUrl: requestData.documentUrl,
            storagePath: requestData.storagePath,
          },
        ],
        signers: requestData.signers,
        status: requestData.status,
        targetSignerEmail: tokenData.signerEmail,
      },
    });
  } catch (error) {
    console.error("[getGuestRequestDetails] Error:", error);
    res.status(500).json({ success: false, message: "Internal server error." });
  }
};

// GET /api/v1/guest/document-bytes?token=xxx
export const getGuestDocumentBytes = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { token } = req.query;

  if (!token || typeof token !== "string") {
    res.status(400).json({ success: false, message: "Token is required." });
    return;
  }

  try {
    const db = getFirestore();
    console.log(`[DocumentBytes] Fetching for token: ${token}`);

    const tokenDoc = await db.collection("signing_tokens").doc(token).get();

    if (!tokenDoc.exists) {
      console.warn(`[DocumentBytes] Token not found: ${token}`);
      res.status(404).json({ success: false, message: "Invalid token." });
      return;
    }

    const tokenData = tokenDoc.data()!;
    console.log(
      `[DocumentBytes] Token valid. Request ID: ${tokenData.requestId}`,
    );

    const requestDoc = await db
      .collection("signature_requests")
      .doc(tokenData.requestId)
      .get();

    if (!requestDoc.exists) {
      console.warn(
        `[DocumentBytes] Signature request not found: ${tokenData.requestId}`,
      );
      res.status(404).json({ success: false, message: "Request not found." });
      return;
    }

    const requestData = requestDoc.data()!;
    const { documentId } = req.query;

    let storagePath = requestData.storagePath;
    let documentName = requestData.documentName;

    if (documentId && typeof documentId === "string") {
      const docs = requestData.documents || [];
      const found = docs.find((d: any) => d.documentId === documentId);
      if (found) {
        storagePath = found.storagePath;
        documentName = found.documentName;
      }
    }

    console.log(`[DocumentBytes] Storage Path: ${storagePath}`);

    // Fetch from Supabase Storage (FIXED: previously used Firebase Storage)
    console.log(`[DocumentBytes] Downloading from Supabase...`);
    const buffer = await downloadFromStorage(storagePath);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${requestData.documentName}"`,
    );
    res.send(buffer);
  } catch (error) {
    console.error(`[DocumentBytes] Error:`, error);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch document." });
  }
};

// POST /api/v1/guest/submit-signature?token=xxx
export const submitGuestSignature = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { token } = req.query;
  const { signatures } = req.body;

  if (!token || typeof token !== "string") {
    res.status(400).json({ success: false, message: "Token is required." });
    return;
  }

  try {
    const db = getFirestore();
    const tokenDoc = await db.collection("signing_tokens").doc(token).get();

    if (!tokenDoc.exists) {
      res.status(404).json({ success: false, message: "Invalid token." });
      return;
    }

    const tokenData = tokenDoc.data()!;
    const requestRef = db
      .collection("signature_requests")
      .doc(tokenData.requestId);
    const requestDoc = await requestRef.get();

    if (!requestDoc.exists) {
      res.status(404).json({ success: false, message: "Request not found." });
      return;
    }

    // Update request status and signer fields via centralized SignatureService
    await signatureService.processSubmission({
      requestId: tokenData.requestId,
      signerEmail: tokenData.signerEmail,
      signerName: "", // Guest name might be empty or we can resolve it from requestData
      updatedFields: signatures,
      ipAddress: req.ip,
    });

    // Mark token as used
    await tokenDoc.ref.update({
      used: true,
      usedAt: FieldValue.serverTimestamp(),
    });

    res
      .status(200)
      .json({ success: true, message: "Signature submitted successfully." });
  } catch (error) {
    console.error("[submitGuestSignature] Error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to submit signature." });
  }
};

// POST /api/v1/guest/resend-link?token=xxx
// Allows a guest with an expired token to request a new link
export const resendGuestSigningLink = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { token } = req.query;

  if (!token || typeof token !== "string") {
    res
      .status(400)
      .json({ success: false, message: "Token is required." } as ApiResponse);
    return;
  }

  try {
    const db = getFirestore();
    const oldTokenDoc = await db.collection("signing_tokens").doc(token).get();

    if (!oldTokenDoc.exists) {
      res.status(404).json({
        success: false,
        message: "Signing link not found.",
      } as ApiResponse);
      return;
    }

    const oldTokenData = oldTokenDoc.data()!;

    if (oldTokenData.used) {
      res.status(400).json({
        success: false,
        message: "This signing link has already been used.",
      } as ApiResponse);
      return;
    }

    // Fetch the signature request to get requester and document info
    const requestRef = db
      .collection("signature_requests")
      .doc(oldTokenData.requestId);
    const requestDoc = await requestRef.get();

    if (!requestDoc.exists) {
      res.status(404).json({
        success: false,
        message: "Signature request not found.",
      } as ApiResponse);
      return;
    }

    const requestData = requestDoc.data()!;

    // Prevent resending if the document is already fully completed
    if (requestData.status === "completed") {
      res.status(400).json({
        success: false,
        message: "This document has already been fully signed.",
      } as ApiResponse);
      return;
    }

    // Find the specific signer in the signers array
    const signers: any[] = requestData.signers || [];
    const signerIndex = signers.findIndex(
      (s: any) =>
        s.role === "needsToSign" &&
        s.signerEmail === oldTokenData.signerEmail &&
        s.signingToken === token,
    );

    if (signerIndex === -1) {
      res.status(404).json({
        success: false,
        message: "Signer record not found for this token.",
      } as ApiResponse);
      return;
    }

    // Generate new token
    const newToken = uuidv4();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + TOKEN_EXPIRY_HOURS);

    // Save the new token document
    await db
      .collection("signing_tokens")
      .doc(newToken)
      .set({
        token: newToken,
        documentId: oldTokenData.documentId,
        requestId: oldTokenData.requestId,
        signerEmail: oldTokenData.signerEmail,
        expiresAt: Timestamp.fromDate(expiresAt),
        used: false,
        createdAt: FieldValue.serverTimestamp(),
      });

    // Invalidate the old token so it can never be used again
    await oldTokenDoc.ref.update({
      used: true,
      invalidatedBy: newToken,
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Update the signer array with the new token
    signers[signerIndex].signingToken = newToken;
    signers[signerIndex].tokenExpiry = Timestamp.fromDate(expiresAt);

    // If the request was previously marked as expired, we probably want to flip it back to pending or inProgress
    // But safely we can just update the signers array
    const updatePayload: any = { signers };
    if (requestData.status === "expired") {
      // Check if there are other signers still in progress/pending. Usually, if re-sent, it becomes pending again.
      updatePayload.status = "pending";
    }

    await requestRef.update(updatePayload);

    // Send the email using the generic email service
    await sendSigningLinkEmail(
      oldTokenData.signerEmail,
      signers[signerIndex].signerName ?? "",
      requestData.requesterName ?? "Someone",
      requestData.documentName ?? "Document",
      buildSigningUrl(newToken),
      requestData.requesterEmail,
      requestData.message,
    );

    res.status(200).json({
      success: true,
      message: "New signing link sent successfully.",
    } as ApiResponse);
  } catch (error) {
    console.error("[resendGuestSigningLink] Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to resend signing link.",
    } as ApiResponse);
  }
};

// GET /api/v1/guest/completed-details?requestId=xxx
export const getCompletedRequestDetails = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { requestId } = req.query;

  if (!requestId || typeof requestId !== "string") {
    res
      .status(400)
      .json({ success: false, message: "Request ID is required." });
    return;
  }

  try {
    const db = getFirestore();
    const requestDoc = await db
      .collection("signature_requests")
      .doc(requestId)
      .get();

    if (!requestDoc.exists) {
      res
        .status(404)
        .json({ success: false, message: "Signature request not found." });
      return;
    }

    const data = requestDoc.data()!;
    if (data.status !== "completed") {
      res
        .status(400)
        .json({
          success: false,
          message: "This document is not yet completed.",
        });
      return;
    }

    res.status(200).json({
      success: true,
      id: requestDoc.id,
      data: {
        documentName: data.documentName,
        completedAt: data.completedAt,
        signers: data.signers,
      },
    });
  } catch (error) {
    console.error("[getCompletedRequestDetails] Error:", error);
    res.status(500).json({ success: false, message: "Internal server error." });
  }
};

// GET /api/v1/guest/completed-bytes?requestId=xxx
export const getCompletedDocumentBytes = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { requestId } = req.query;

  if (!requestId || typeof requestId !== "string") {
    res
      .status(400)
      .json({ success: false, message: "Request ID is required." });
    return;
  }

  try {
    const db = getFirestore();
    const requestDoc = await db
      .collection("signature_requests")
      .doc(requestId)
      .get();

    if (!requestDoc.exists) {
      res.status(404).json({ success: false, message: "Request not found." });
      return;
    }

    const data = requestDoc.data()!;
    if (data.status !== "completed" || !data.storagePath) {
      res
        .status(400)
        .json({ success: false, message: "Completed document not available." });
      return;
    }

    // Ensure we are serving the _completed version
    const storagePath = data.storagePath;

    const buffer = await downloadFromStorage(storagePath);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${data.documentName}"`,
    );
    res.send(buffer);
  } catch (error) {
    console.error("[getCompletedDocumentBytes] Error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch completed document." });
  }
};
