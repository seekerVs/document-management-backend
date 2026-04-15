import { v4 as uuidv4 } from "uuid";
import { getFirestore } from "./firebase.service.js";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { NotificationRepository } from "./notification.service.js";
import { ActivityService } from "./activity.service.js";
import { SignatureFieldPayload } from "../types/index.js";
import { PdfService } from "./pdf.service.js";
import { uploadToStorage } from "./supabase.service.js";
import { sendDocumentCompletedEmail } from "./email.service.js";

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
    const requestRef = db
      .collection("signature_requests")
      .doc(params.requestId);

    let allSignedState = false;
    let dataForPdfGeneration: any = null;

    await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(requestRef);
      if (!snap.exists) throw new Error("Signature request not found.");

      const data = snap.data()!;
      const signers = data.signers || [];
      const ownerUid = data.requestedByUid;
      const documentName = data.documentName;

      // 1. Update the specific signer's record
      const updatedSigners = signers.map((s: any) => {
        if (s.signerEmail.toLowerCase() !== params.signerEmail.toLowerCase())
          return s;

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
        completedAt: allSigned
          ? FieldValue.serverTimestamp()
          : data.completedAt || null,
      });

      if (allSigned) {
        allSignedState = true;
        dataForPdfGeneration = {
          documents: data.documents || [
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
    });

    // 5. Execute PDF Flattening outside the transaction to prevent timeouts
    if (allSignedState && dataForPdfGeneration) {
      try {
        const pdfService = new PdfService();
        const updatedDocuments = [...dataForPdfGeneration.documents];

        for (let i = 0; i < updatedDocuments.length; i++) {
          const doc = updatedDocuments[i];
          console.log(`[SignatureService] Flattening doc ${i + 1}/${updatedDocuments.length}: ${doc.documentName}`);

          const buffer = await pdfService.flattenDocument({
            storagePath: doc.storagePath,
            documentId: doc.documentId,
            signers: dataForPdfGeneration.updatedSigners,
          });

          // Upload to a new path to preserve the original master document
          const newStoragePath = doc.storagePath.replace(
            /\.pdf$/i,
            "_completed.pdf",
          );
          await uploadToStorage(buffer, newStoragePath, "application/pdf");

          // Compute the new document URL
          const newDocumentUrl = doc.documentUrl
            .replace(
              encodeURIComponent(doc.storagePath),
              encodeURIComponent(newStoragePath),
            )
            .replace(
              doc.storagePath.replace(/\//g, "%2F"),
              newStoragePath.replace(/\//g, "%2F"),
            )
            .replace(doc.storagePath, newStoragePath);

          // Update local copy
          updatedDocuments[i] = {
            ...doc,
            storagePath: newStoragePath,
            documentUrl: newDocumentUrl,
          };

          // File into owner's library
          try {
            await this._fileCompletedDocumentForOwner({
              db,
              ownerUid: dataForPdfGeneration.requestedByUid,
              documentName: doc.documentName,
              storagePath: newStoragePath,
              documentUrl: newDocumentUrl,
              fileSizeMB: buffer.length / (1024 * 1024),
              requestId: dataForPdfGeneration.requestId,
              totalDocs: updatedDocuments.length,
            });
          } catch (filingError) {
            console.error(`[SignatureService] Failed to file doc ${doc.documentId}:`, filingError);
          }
        }

        // Update the Firestore database to point to the new flattened documents
        await requestRef.update({
          documents: updatedDocuments,
          // Legacy support: point to the first one
          storagePath: updatedDocuments[0].storagePath,
          documentUrl: updatedDocuments[0].documentUrl,
        });

        console.log(`[SignatureService] All ${updatedDocuments.length} PDFs flattened and updated.`);

        // Logic moved inside the loop above

        // 7. Send Completion Emails to all parties
        const baseUrl = process.env.SIGNING_BASE_URL || "https://your-web-app.com";
        const completedUrl = `${baseUrl}/completed/${dataForPdfGeneration.requestId}`;

        // Send to Requester
        if (dataForPdfGeneration.requesterEmail) {
          await sendDocumentCompletedEmail(
            dataForPdfGeneration.requesterEmail,
            dataForPdfGeneration.requesterName,
            dataForPdfGeneration.requesterName,
            dataForPdfGeneration.documentName,
            completedUrl,
          );
        }

        // Send to all Signers (including CCs)
        for (const s of dataForPdfGeneration.updatedSigners) {
          await sendDocumentCompletedEmail(
            s.signerEmail,
            s.signerName,
            dataForPdfGeneration.requesterName,
            dataForPdfGeneration.documentName,
            completedUrl,
          );
        }
      } catch (error) {
        console.error(
          "[SignatureService] Failed to generate flattened PDF:",
          error,
        );
      }
    }
  }

  /**
   * Creates a Requests/{documentName} folder hierarchy for the request owner
   * and saves the flattened PDF as a Firestore document record.
   */
  private async _fileCompletedDocumentForOwner(params: {
    db: FirebaseFirestore.Firestore;
    ownerUid: string;
    documentName: string;
    storagePath: string;
    documentUrl: string;
    fileSizeMB: number;
    requestId: string;
    totalDocs: number;
  }): Promise<void> {
    const { db, ownerUid, documentName, storagePath, documentUrl, fileSizeMB, requestId, totalDocs } =
      params;
    const now = FieldValue.serverTimestamp();

    // 1. Find or create the "Requests" root folder
    const requestsFolderSnap = await db
      .collection("folders")
      .where("ownerUid", "==", ownerUid)
      .where("parentId", "==", null)
      .where("name", "==", "Requests")
      .limit(1)
      .get();

    let requestsFolderId: string;

    if (!requestsFolderSnap.empty) {
      requestsFolderId = requestsFolderSnap.docs[0].id;
    } else {
      requestsFolderId = uuidv4();
      await db
        .collection("folders")
        .doc(requestsFolderId)
        .set({
          ownerUid,
          name: "Requests",
          parentId: null,
          itemCount: 0,
          createdAt: now,
          updatedAt: now,
        });
      console.log(
        `[SignatureService] Created "Requests" folder: ${requestsFolderId}`,
      );
    }

    // 2. Create a subfolder for the request (use requestId or formatted name)
    const requestFolderSnap = await db
      .collection("signature_requests")
      .doc(requestId)
      .get();
    const requestName = requestFolderSnap.data()?.documentName || "Request";
    const subFolderName = totalDocs > 1 
      ? `${requestName} (Request ID: ${requestId.slice(0, 8)})`
      : requestName.replace(/\.pdf$/i, "");
      
    const subFolderId = `folder_${requestId}`; // Deterministic ID per request
    const subFolderRef = db.collection("folders").doc(subFolderId);
    const subFolderDoc = await subFolderRef.get();

    if (!subFolderDoc.exists) {
      await subFolderRef.set({
        ownerUid,
        name: subFolderName,
        parentId: requestsFolderId,
        itemCount: 0,
        createdAt: now,
        updatedAt: now,
      });

      // Update parent item count
      await db
        .collection("folders")
        .doc(requestsFolderId)
        .update({
          itemCount: FieldValue.increment(1),
          updatedAt: now,
        });
    }

    // 3. Create a documents record for the flattened PDF
    const docId = uuidv4();
    const completedName = documentName.replace(/\.pdf$/i, "_completed.pdf");

    await db.collection("documents").doc(docId).set({
      ownerUid,
      name: completedName,
      fileUrl: storagePath,
      storagePath: storagePath,
      fileType: "pdf",
      fileSizeMB,
      status: "completed",
      folderId: subFolderId,
      authorizedEmails: [],
      createdAt: now,
      updatedAt: now,
    });

    // Update subfolder item count
    await db
      .collection("folders")
      .doc(subFolderId)
      .update({
        itemCount: FieldValue.increment(1),
        updatedAt: now,
      });

    // 4. Update owner's usedStorageMB
    await db
      .collection("users")
      .doc(ownerUid)
      .update({
        usedStorageMB: FieldValue.increment(fileSizeMB),
      });

    console.log(
      `[SignatureService] Filed completed doc "${completedName}" in Requests/${subFolderName} for ${ownerUid}`,
    );
  }
}
