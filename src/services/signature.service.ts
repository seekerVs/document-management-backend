import { getFirestore } from "./firebase.service.js";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { NotificationRepository } from "./notification.service.js";
import { ActivityService } from "./activity.service.js";
import { SignatureFieldPayload } from "../types/index.js";

const notifRepo = new NotificationRepository();
const activityService = new ActivityService();

export class SignatureService {
  /**
   * Processes a signature submission, updates document state, and handles notifications.
   * Centralizes logic for both mobile (authenticated) and web (guest) signing.
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
    const requestRef = db.collection("signature_requests").doc(params.requestId);
    
    await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(requestRef);
      if (!snap.exists) throw new Error("Signature request not found.");

      const data = snap.data()!;
      const signers = data.signers || [];
      const ownerUid = data.requestedByUid;
      const documentName = data.documentName;

      // 1. Update the specific signer's record
      const updatedSigners = signers.map((s: any) => {
        if (s.signerEmail.toLowerCase() !== params.signerEmail.toLowerCase()) return s;
        
        return {
          ...s,
          status: "signed",
          signedAt: Timestamp.now(),
          signatureImageUrl: params.signatureImageUrl ?? s.signatureImageUrl,
          fields: params.updatedFields,
          ipAddress: params.ipAddress ?? null,
          tokenUsed: true,
          signerUid: params.signerUid ?? s.signerUid, // Preserve or update UID
        };
      });

      // 2. Check if all "needsToSign" participants have finished
      const allSigned = updatedSigners
        .filter((s: any) => s.role === "needsToSign")
        .every((s: any) => s.status === "signed");

      // 3. Commit state changes to Firestore
      transaction.update(requestRef, {
        signers: updatedSigners,
        status: allSigned ? "completed" : "inProgress",
        updatedAt: FieldValue.serverTimestamp(),
        completedAt: allSigned ? FieldValue.serverTimestamp() : (data.completedAt || null),
      });

      // 4. Handle Notifications and Activity Logs (Post-Transaction or via non-transactional calls)
      // We use await here but outside the transaction logic is often safer for side effects
      // however for simplicity in this script we'll trigger them after the update.
      
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
          if (s.signerUid && s.signerUid !== params.signerUid) {
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

        // Log Global Completion Activity
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

      // Log Individual Signature Activity
      await activityService.logActivity({
        documentId: data.documentId || params.requestId,
        documentName: documentName,
        actorUid: params.signerUid || "system",
        actorName: params.signerName,
        action: "signed",
      });
    });
  }
}
