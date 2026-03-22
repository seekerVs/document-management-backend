import * as admin from "firebase-admin";
import { getFirestore } from "./firebase.service";

interface CreateNotificationParams {
  recipientUid: string;
  type: string;
  title: string;
  body: string;
  requestId?: string;
  documentName?: string;
  actorName?: string;
}

// Reusable server-side notification writer
export class NotificationRepository {
  async createNotification(params: CreateNotificationParams): Promise<void> {
    const db = getFirestore();
    await db.collection("notifications").add({
      recipientUid: params.recipientUid,
      type: params.type,
      title: params.title,
      body: params.body,
      isRead: false,
      requestId: params.requestId ?? null,
      documentName: params.documentName ?? null,
      actorName: params.actorName ?? null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
}
