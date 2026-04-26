import { getFirestore } from "./firebase.service.js";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { NotificationRepository } from "./notification.service.js";
import { ActivityService } from "./activity.service.js";
import { SignatureFieldPayload } from "../types/index.js";
import { PdfService } from "./pdf.service.js";
import { uploadToStorage } from "./supabase.service.js";
import {
  sendDocumentCompletedEmail,
  sendSigningLinkEmail,
} from "./email.service.js";
import { environment } from "../config/environment.js";
import { v4 as uuidv4 } from "uuid";

const notifRepo = new NotificationRepository();
const activityService = new ActivityService();

const asFiniteNumber = (
  value: unknown,
  fallback?: number
): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

interface SignatureFieldRecord extends Record<string, unknown> {
  fieldId: string;
  type?: "signature" | "textbox";
  documentId?: string;
  page?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  value?: string;
  isRequired?: boolean;
}

interface SignatureSigner extends Record<string, unknown> {
  signerEmail: string;
  signerName?: string;
  order?: number;
  role?: "needsToSign" | "receivesACopy";
  status?: "pending" | "signed" | "declined";
  signingToken?: string | null;
  tokenExpiry?: Timestamp | null;
  tokenUsed?: boolean;
  signatureImageUrl?: string;
  fields?: SignatureFieldRecord[];
  signerUid?: string;
}

interface SignatureDocument {
  documentId: string;
  documentName: string;
  documentUrl: string;
  storagePath: string;
}

interface PdfGenerationPayload {
  documents: SignatureDocument[];
  updatedSigners: SignatureSigner[];
  requesterName: string;
  requesterEmail?: string;
  requestedByUid: string;
  documentName: string;
  requestId: string;
}

const mergeSignerFields = (
  existingFields: SignatureFieldRecord[] = [],
  submittedFields: SignatureFieldPayload[] = []
): SignatureFieldRecord[] => {
  const byId = new Map<string, SignatureFieldRecord>();

  for (const field of existingFields) {
    if (!field?.fieldId || typeof field.fieldId !== "string") continue;
    byId.set(field.fieldId, { ...field });
  }

  for (const submitted of submittedFields) {
    if (!submitted?.fieldId || typeof submitted.fieldId !== "string") continue;
    const base: Partial<SignatureFieldRecord> =
      byId.get(submitted.fieldId) ?? {};
    const submittedWithRequired = submitted as SignatureFieldPayload & {
      isRequired?: boolean;
    };

    byId.set(submitted.fieldId, {
      ...base,
      ...submitted,
      fieldId: submitted.fieldId,
      type: submitted.type ?? base.type,
      documentId: submitted.documentId ?? base.documentId,
      page: asFiniteNumber(submitted.page, base.page),
      x: asFiniteNumber(submitted.x, base.x),
      y: asFiniteNumber(submitted.y, base.y),
      width: asFiniteNumber(submitted.width, base.width),
      height: asFiniteNumber(submitted.height, base.height),
      value: submitted.value ?? base.value,
      isRequired: submittedWithRequired.isRequired ?? base.isRequired,
    });
  }

  return Array.from(byId.values());
};

export class SignatureService {
  /**
   * Processes a signature submission, updates document state, and handles notifications.
   * Centralizes logic for both mobile (authenticated) and web (guest) signing.
   * @param params - The submission parameters including request ID, signer info, and updated fields
   */
  async processSubmission(params: {
    requestId: string;
    signerEmail: string;
    signerName: string;
    updatedFields: SignatureFieldPayload[];
    signatureImageUrl?: string;
    ipAddress?: string;
    signerUid?: string; // Optional: if the signer is an authenticated user
  }): Promise<void> {
    const db = getFirestore();
    const requestRef = db
      .collection("signature_requests")
      .doc(params.requestId);
    type NextSignerDispatch = {
      signerEmail: string;
      signerName: string;
      requesterName: string;
      requesterEmail?: string;
      message?: string;
      documentName: string;
      token: string;
    };

    const transactionResult = await db.runTransaction(
      async (transaction): Promise<{
        payload: PdfGenerationPayload | null;
        nextSignerDispatch: NextSignerDispatch | null;
      }> => {
        let payload: PdfGenerationPayload | null = null;
        let nextSignerDispatch: NextSignerDispatch | null = null;
        const snap = await transaction.get(requestRef);
        if (!snap.exists) throw new Error("Signature request not found.");

        const data = snap.data()!;
        const signers = (data.signers as SignatureSigner[]) || [];
        const ownerUid = data.requestedByUid;
        const documentName = data.documentName;
        const signingOrderEnabled = data.signingOrderEnabled === true;
        const signerEmailLower = params.signerEmail.toLowerCase();

        const targetSigner = signers.find(
          (s) => s.signerEmail.toLowerCase() === signerEmailLower
        );

        if (!targetSigner) {
          throw new Error("Signer is not assigned to this request.");
        }
        if (targetSigner.role !== "needsToSign") {
          throw new Error("Only signers with sign permission can sign.");
        }
        if (targetSigner.status !== "pending") {
          throw new Error("This signer has already completed signing.");
        }

        if (signingOrderEnabled) {
          const pendingOrderedSigners = signers
            .filter(
              (s) => s.role === "needsToSign" && s.status === "pending"
            )
            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

          const currentTurnSigner = pendingOrderedSigners[0];
          if (
            !currentTurnSigner ||
            currentTurnSigner.signerEmail.toLowerCase() !== signerEmailLower
          ) {
            throw new Error("It is not this signer's turn to sign yet.");
          }
        }

        // 1. Update the specific signer's record
        const updatedSigners: SignatureSigner[] = signers.map(
          (s): SignatureSigner => {
            if (
              s.signerEmail.toLowerCase() !== params.signerEmail.toLowerCase()
            ) {
              return s;
            }

            return {
              ...s,
              status: "signed",
              signedAt: Timestamp.now(),
              signatureImageUrl:
                params.signatureImageUrl ?? s.signatureImageUrl,
              fields: mergeSignerFields(s.fields ?? [], params.updatedFields),
              ipAddress: params.ipAddress ?? null,
              tokenUsed: true,
              signerUid: params.signerUid ?? s.signerUid, // Preserve or update UID
            };
          }
        );

        // 2. Check if all "needsToSign" participants have finished
        const allSigned = updatedSigners
          .filter((s) => s.role === "needsToSign")
          .every((s) => s.status === "signed");

        if (signingOrderEnabled && !allSigned) {
          const nextPendingSigner = updatedSigners
            .filter((s) => s.role === "needsToSign" && s.status === "pending")
            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))[0];

          if (nextPendingSigner && !nextPendingSigner.signingToken) {
            const nextToken = uuidv4();
            const expiresAt = new Date();
            expiresAt.setHours(expiresAt.getHours() + 72);

            nextPendingSigner.signingToken = nextToken;
            nextPendingSigner.tokenExpiry = Timestamp.fromDate(expiresAt);
            nextPendingSigner.tokenUsed = false;

            transaction.set(db.collection("signing_tokens").doc(nextToken), {
              token: nextToken,
              documentId: data.documentId,
              requestId: params.requestId,
              signerEmail: nextPendingSigner.signerEmail.trim().toLowerCase(),
              expiresAt: Timestamp.fromDate(expiresAt),
              used: false,
              createdAt: FieldValue.serverTimestamp(),
            });

            const docs = (data.documents as SignatureDocument[] | undefined) ?? [
              {
                documentId: data.documentId,
                documentName: data.documentName,
                documentUrl: data.documentUrl,
                storagePath: data.storagePath,
              },
            ];
            const emailDocName =
              docs.length > 1
                ? `${docs[0].documentName} and ${docs.length - 1} other(s)`
                : docs[0].documentName;

            nextSignerDispatch = {
              signerEmail: nextPendingSigner.signerEmail,
              signerName: nextPendingSigner.signerName ?? "",
              requesterName: data.requesterName || "Someone",
              requesterEmail: data.requesterEmail,
              message: data.message,
              documentName: emailDocName,
              token: nextToken,
            };
          }
        }

        // 3. Commit state changes to Firestore
        transaction.update(requestRef, {
          signers: updatedSigners,
          status: allSigned ? "completed" : "inProgress",
          updatedAt: FieldValue.serverTimestamp(),
          completedAt: allSigned
            ? FieldValue.serverTimestamp()
            : data.completedAt || null,
        });

        if (allSigned) {
          payload = {
            documents: (data.documents as SignatureDocument[] | undefined) ?? [
              {
                documentId: data.documentId,
                documentName: data.documentName,
                documentUrl: data.documentUrl,
                storagePath: data.storagePath,
              },
            ],
            updatedSigners: updatedSigners,
            requesterName: data.requesterName || "Someone",
            requesterEmail: data.requesterEmail,
            requestedByUid: ownerUid,
            documentName: documentName,
            requestId: params.requestId,
          };
        }

        // 4. Handle Notifications and Activity Logs (Post-Transaction or via non-transactional calls)
        // We use await here but outside the transaction logic is often safer for side effects
        // however for simplicity in this script we'll trigger them after the update.

        // Log Individual Signature Activity (logged first to get earlier server timestamp)
        await activityService.logActivity({
          documentId: data.documentId || params.requestId,
          documentName: documentName,
          actorUid: params.signerUid || "system",
          actorName: params.signerName,
          action: "signed",
        });

        if (allSigned) {
          // Notification for Owner
          await notifRepo.createNotification({
            recipientUid: ownerUid,
            type: "documentCompleted",
            title: "Document fully signed",
            body: `${documentName} has been signed by all parties.`,
            requestId: params.requestId,
            documentName: documentName,
            actorName: params.signerName,
          });

          // Notifications for other authenticated signers and CC recipients
          for (const s of updatedSigners) {
            // If they are an authenticated user and NOT the one who just signed
            if (
              typeof s.signerUid === "string" &&
              s.signerUid !== params.signerUid
            ) {
              await notifRepo.createNotification({
                recipientUid: s.signerUid,
                type: "documentCompleted",
                title: "Document fully signed",
                body: `${documentName} is now complete.`,
                requestId: params.requestId,
                documentName: documentName,
              });
            }
          }

          // Log Global Completion Activity (logged after "signed" to get later server timestamp)
          await activityService.logActivity({
            documentId: data.documentId || params.requestId,
            documentName: documentName,
            actorUid: params.signerUid || "system",
            actorName: params.signerName,
            action: "completed",
          });
        } else {
          // Partial Signature Notification (Owner only)
          await notifRepo.createNotification({
            recipientUid: ownerUid,
            type: "documentSigned",
            title: `${params.signerName} signed`,
            body: `${params.signerName} has signed ${documentName}.`,
            requestId: params.requestId,
            documentName: documentName,
            actorName: params.signerName,
          });
        }
        return { payload, nextSignerDispatch };
      }
    );

    const dataForPdfGeneration = transactionResult.payload;
    const nextSignerDispatch = transactionResult.nextSignerDispatch;

    if (nextSignerDispatch) {
      try {
        const signingUrl = `${environment.signingBaseUrl}/sign?token=${nextSignerDispatch.token}`;
        await sendSigningLinkEmail(
          nextSignerDispatch.signerEmail,
          nextSignerDispatch.signerName,
          nextSignerDispatch.requesterName,
          nextSignerDispatch.documentName,
          signingUrl,
          nextSignerDispatch.requesterEmail,
          nextSignerDispatch.message
        );
      } catch (error) {
        console.error(
          "[SignatureService] Failed to send next signer signing link:",
          error
        );
      }
    }

    // 5. Execute PDF Flattening outside the transaction to prevent timeouts
    if (dataForPdfGeneration) {
      try {
        const pdfService = new PdfService();
        const updatedDocuments = [...dataForPdfGeneration.documents];
        let totalCompletedSizeMB = 0;

        for (let i = 0; i < updatedDocuments.length; i++) {
          const doc = updatedDocuments[i];
          console.log(
            `[SignatureService] Flattening doc ${i + 1}/${updatedDocuments.length}: ${doc.documentName}`
          );

          const buffer = await pdfService.flattenDocument({
            storagePath: doc.storagePath,
            documentId: doc.documentId,
            signers: dataForPdfGeneration.updatedSigners,
            totalDocuments: updatedDocuments.length,
          });

          // Upload to a new path to preserve the original master document
          const newStoragePath = doc.storagePath.replace(
            /\.pdf$/i,
            "_completed.pdf"
          );
          await uploadToStorage(buffer, newStoragePath, "application/pdf");

          // Compute the new document URL
          const newDocumentUrl = doc.documentUrl
            .replace(
              encodeURIComponent(doc.storagePath),
              encodeURIComponent(newStoragePath)
            )
            .replace(
              doc.storagePath.replace(/\//g, "%2F"),
              newStoragePath.replace(/\//g, "%2F")
            )
            .replace(doc.storagePath, newStoragePath);

          // Update local copy
          updatedDocuments[i] = {
            ...doc,
            storagePath: newStoragePath,
            documentUrl: newDocumentUrl,
          };

          totalCompletedSizeMB += buffer.length / (1024 * 1024);
        }

        // Keep storage accounting even though completed docs are no longer filed into Requests folders.
        await db
          .collection("users")
          .doc(dataForPdfGeneration.requestedByUid)
          .update({
            usedStorageMB: FieldValue.increment(totalCompletedSizeMB),
          });

        // Update the Firestore database to point to the new flattened documents
        await requestRef.update({
          documents: updatedDocuments,
          // Legacy support: point to the first one
          storagePath: updatedDocuments[0].storagePath,
          documentUrl: updatedDocuments[0].documentUrl,
        });

        console.log(
          `[SignatureService] All ${updatedDocuments.length} PDFs flattened and updated.`
        );

        // Logic moved inside the loop above

        // 7. Send Completion Emails to all parties
        const baseUrl = environment.signingBaseUrl;
        const completedUrl = `${baseUrl}/completed/${dataForPdfGeneration.requestId}`;

        // Send to Requester
        if (dataForPdfGeneration.requesterEmail) {
          await sendDocumentCompletedEmail(
            dataForPdfGeneration.requesterEmail,
            dataForPdfGeneration.requesterName,
            dataForPdfGeneration.requesterName,
            dataForPdfGeneration.documentName,
            completedUrl
          );
        }

        // Send to all Signers (including CCs)
        for (const s of dataForPdfGeneration.updatedSigners) {
          const signerEmail = s.signerEmail;
          const signerName = s.signerName ?? "";
          await sendDocumentCompletedEmail(
            signerEmail,
            signerName,
            dataForPdfGeneration.requesterName,
            dataForPdfGeneration.documentName,
            completedUrl
          );
        }
      } catch (error) {
        console.error(
          "[SignatureService] Failed to generate flattened PDF:",
          error
        );
      }
    }
  }
}
