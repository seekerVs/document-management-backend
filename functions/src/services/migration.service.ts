import { getFirestore } from "./firebase.service.js";
import { Timestamp } from "firebase-admin/firestore";

const RESERVED_USERNAMES = new Set([
  "admin",
  "support",
  "system",
  "root",
  "scrivener",
  "help",
  "security",
]);

export class MigrationService {
  private db = getFirestore();

  async backfillUsers() {
    console.log("Starting backfillUsers migration...");
    const usersSnap = await this.db.collection("users").get();
    const results = {
      processed: 0,
      updated: 0,
      errors: 0,
    };

    for (const doc of usersSnap.docs) {
      results.processed++;
      const data = doc.data();
      const uid = doc.id;

      const needsUsername = !data.username || !data.usernameLower;
      const needsNormalization = !data.nameLower || !data.emailLower;

      if (needsUsername || needsNormalization) {
        try {
          const updates: any = {
            updatedAt: Timestamp.now(),
          };

          if (!data.nameLower && data.name) {
            updates.nameLower = data.name.toLowerCase();
          }
          if (!data.emailLower && data.email) {
            updates.emailLower = data.email.toLowerCase();
          }

          if (needsUsername) {
            const seed = (data.name || data.email || "user")
              .split(" ")
              .join("_");
            const username = await this.allocateUniqueUsername(uid, seed);
            updates.username = username;
            updates.usernameLower = username;
          }

          await this.db.collection("users").doc(uid).update(updates);
          results.updated++;
          console.log(`Updated user ${uid} with username: ${updates.username}`);
        } catch (error) {
          console.error(`Error backfilling user ${uid}:`, error);
          results.errors++;
        }
      }
    }

    console.log("Migration complete:", results);
    return results;
  }

  private sanitizeUsernameSeed(input: string): string {
    const lowered = input.trim().toLowerCase();
    const basic = lowered.replace(/[^a-z0-9_]/g, "_");
    const collapsed = basic.replace(/_+/g, "_");
    const trimmed = collapsed.replace(/^_+|_+$ /g, "");
    let candidate = trimmed;
    if (!candidate) candidate = "user";
    if (candidate.length > 20) candidate = candidate.substring(0, 20);
    if (candidate.length < 3) candidate = (candidate + "user").substring(0, 3);
    if (RESERVED_USERNAMES.has(candidate)) {
      candidate = (candidate + "_app").substring(0, 20);
    }
    return candidate;
  }

  private async allocateUniqueUsername(
    uid: string,
    seed: string
  ): Promise<string> {
    const base = this.sanitizeUsernameSeed(seed);

    for (let i = 0; i < 5000; i++) {
      const suffix = i === 0 ? "" : i.toString();
      let candidate = base + suffix;

      if (candidate.length > 20) {
        const room = 20 - suffix.length;
        candidate = base.substring(0, Math.max(1, room)) + suffix;
      }

      const isAvailable = await this.isUsernameAvailable(candidate);
      if (!isAvailable) continue;

      try {
        await this.claimUsername(uid, candidate, candidate);
        return candidate;
      } catch (e) {
        console.warn(`Collision on username ${candidate}, retrying...`);
        console.warn(e);
      }
    }
    throw new Error("Could not allocate unique username");
  }

  private async isUsernameAvailable(usernameLower: string): Promise<boolean> {
    const doc = await this.db.collection("usernames").doc(usernameLower).get();
    return !doc.exists;
  }

  private async claimUsername(
    uid: string,
    username: string,
    usernameLower: string
  ): Promise<void> {
    const now = Timestamp.now();
    await this.db.collection("usernames").doc(usernameLower).create({
      uid,
      username,
      usernameLower,
      createdAt: now,
      updatedAt: now,
    });
  }
}
