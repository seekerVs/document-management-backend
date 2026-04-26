import { getFirestore } from "./firebase.service.js";
import { FieldValue } from "firebase-admin/firestore";
import { NotificationRepository } from "./notification.service.js";
import { ActivityService } from "./activity.service.js";

const notificationRepo = new NotificationRepository();
const activityService = new ActivityService();

interface ContactData {
  uid: string;
  name: string;
  username: string;
  email: string;
  photoUrl: string | null;
  bio: string | null;
}

export class ContactsService {
  async searchUsers(query: string): Promise<ContactData[]> {
    const db = getFirestore();
    const normalized = query.trim().toLowerCase();
    if (!normalized) return [];

    const usersRef = db.collection("users");
    
    // Search by emailLower
    const byEmail = await usersRef.where("emailLower", "==", normalized).limit(1).get();
    
    // Search by usernameLower
    const byUsername = await usersRef.where("usernameLower", "==", normalized).limit(1).get();

    const results: ContactData[] = [];
    const addedUids = new Set<string>();

    const processDocs = (docs: FirebaseFirestore.QueryDocumentSnapshot[]) => {
      for (const doc of docs) {
        if (!addedUids.has(doc.id)) {
          addedUids.add(doc.id);
          const data = doc.data();
          results.push({
            uid: doc.id,
            name: data.name || "",
            username: data.username || "",
            email: data.email || "",
            photoUrl: data.photoUrl || null,
            bio: data.bio || null,
          });
        }
      }
    };

    processDocs(byEmail.docs);
    processDocs(byUsername.docs);

    return results;
  }

  async sendRequest(senderUid: string, targetUid: string): Promise<void> {
    const db = getFirestore();
    if (senderUid === targetUid) throw new Error("Cannot send request to yourself");

    // Get sender data
    const senderDoc = await db.collection("users").doc(senderUid).get();
    if (!senderDoc.exists) throw new Error("Sender not found");
    const senderData = senderDoc.data()!;

    // Get target data
    const targetDoc = await db.collection("users").doc(targetUid).get();
    if (!targetDoc.exists) throw new Error("Target user not found");
    const targetData = targetDoc.data()!;

    const batch = db.batch();

    // Create 'sent' doc for sender
    const senderContactRef = db.collection("users").doc(senderUid).collection("contacts").doc(targetUid);
    batch.set(senderContactRef, {
      uid: targetUid,
      name: targetData.name || "",
      username: targetData.username || "",
      email: targetData.email || "",
      photoUrl: targetData.photoUrl || null,
      bio: targetData.bio || null,
      status: "sent",
      isFavorite: false,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    // Create 'pending' doc for receiver
    const receiverContactRef = db.collection("users").doc(targetUid).collection("contacts").doc(senderUid);
    batch.set(receiverContactRef, {
      uid: senderUid,
      name: senderData.name || "",
      username: senderData.username || "",
      email: senderData.email || "",
      photoUrl: senderData.photoUrl || null,
      bio: senderData.bio || null,
      status: "pending",
      isFavorite: false,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    await batch.commit();

    // Notify receiver
    await notificationRepo.createNotification({
      recipientUid: targetUid,
      type: "contact_request",
      title: "New Contact Request",
      body: `${senderData.name} sent you a contact request.`,
      actorName: senderData.name,
    });

    // Log activity for receiver
    await activityService.logActivity({
      documentId: senderUid,
      documentName: "Contact Request",
      actorUid: senderUid,
      actorName: senderData.name,
      action: "sent_contact_request",
    });
  }

  async acceptRequest(receiverUid: string, senderUid: string): Promise<void> {
    const db = getFirestore();
    const receiverContactRef = db.collection("users").doc(receiverUid).collection("contacts").doc(senderUid);
    const senderContactRef = db.collection("users").doc(senderUid).collection("contacts").doc(receiverUid);

    const doc = await receiverContactRef.get();
    if (!doc.exists || doc.data()?.status !== "pending") {
      throw new Error("No pending request found");
    }

    const receiverDoc = await db.collection("users").doc(receiverUid).get();
    const receiverName = receiverDoc.data()?.name || "Someone";

    const batch = db.batch();
    batch.update(receiverContactRef, {
      status: "accepted",
      updatedAt: FieldValue.serverTimestamp(),
    });
    batch.update(senderContactRef, {
      status: "accepted",
      updatedAt: FieldValue.serverTimestamp(),
    });

    await batch.commit();

    // Notify sender that their request was accepted
    await notificationRepo.createNotification({
      recipientUid: senderUid,
      type: "contact_accepted",
      title: "Contact Request Accepted",
      body: `${receiverName} accepted your contact request.`,
      actorName: receiverName,
    });

    // Log activity for sender
    await activityService.logActivity({
      documentId: receiverUid,
      documentName: "Contact Request",
      actorUid: receiverUid,
      actorName: receiverName,
      action: "accepted_contact_request",
    });
  }

  async declineOrRemove(uidA: string, uidB: string): Promise<void> {
    const db = getFirestore();
    const batch = db.batch();
    
    const contactRefA = db.collection("users").doc(uidA).collection("contacts").doc(uidB);
    const contactRefB = db.collection("users").doc(uidB).collection("contacts").doc(uidA);

    batch.delete(contactRefA);
    batch.delete(contactRefB);

    await batch.commit();
  }

  async toggleFavorite(uid: string, contactUid: string): Promise<void> {
    const db = getFirestore();
    const contactRef = db.collection("users").doc(uid).collection("contacts").doc(contactUid);
    
    const doc = await contactRef.get();
    if (!doc.exists) throw new Error("Contact not found");

    const currentFavorite = doc.data()?.isFavorite || false;
    
    await contactRef.update({
      isFavorite: !currentFavorite,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
}
