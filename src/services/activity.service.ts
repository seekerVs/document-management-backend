import { getFirestore } from "./firebase.service.js";
import { FieldValue } from "firebase-admin/firestore";

export interface LogActivityParams {
  documentId: string;
  documentName?: string;
  actorUid: string;
  actorName: string;
  action: string;
}

export class ActivityService {
  async logActivity(params: LogActivityParams): Promise<void> {
    try {
      const db = getFirestore();
      const docRef = db.collection("activities").doc();
      await docRef.set({
        activityId: docRef.id,
        documentId: params.documentId,
        documentName: params.documentName ?? null,
        actorUid: params.actorUid,
        actorName: params.actorName,
        action: params.action,
        timestamp: FieldValue.serverTimestamp(),
      });
    } catch (error) {
      console.error("[ActivityService] Error logging activity:", error);
      // Don't throw error to prevent blocking the main process
    }
  }
}
