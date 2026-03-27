import * as admin from "firebase-admin";
import * as fs from "fs";
import * as path from "path";

// src/services/firebase.service.ts

let initialized = false;
let resolvedStorageBucket = "";

const resolveStorageBucket = (projectId?: string): string => {
  const fromEnv = (process.env.FIREBASE_STORAGE_BUCKET ?? "").trim();
  if (fromEnv) return fromEnv;

  if (projectId) {
    // Firebase default bucket naming for most projects.
    return `${projectId}.appspot.com`;
  }

  throw new Error(
    "Firebase storage bucket is not configured. Set FIREBASE_STORAGE_BUCKET.",
  );
};

export const initFirebase = (): void => {
  if (initialized) return;

  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

  if (!serviceAccountPath) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_PATH is not set in .env");
  }

  const resolvedPath = path.resolve(serviceAccountPath);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(
      `Firebase service account file not found at: ${resolvedPath}`,
    );
  }

  const serviceAccount = JSON.parse(fs.readFileSync(resolvedPath, "utf8"));
  resolvedStorageBucket = resolveStorageBucket(serviceAccount.project_id);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: resolvedStorageBucket,
  });

  initialized = true;
  console.log("✅ Firebase Admin SDK initialized");
  console.log(`🪣 Firebase Storage bucket: ${resolvedStorageBucket}`);
};

export const getFirestore = (): admin.firestore.Firestore => {
  return admin.firestore();
};

export const getAuth = (): admin.auth.Auth => {
  return admin.auth();
};

export const getStorageBucketName = (): string => {
  if (!initialized || !resolvedStorageBucket) {
    throw new Error("Firebase is not initialized. Call initFirebase() first.");
  }

  return resolvedStorageBucket;
};
