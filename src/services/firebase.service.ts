import admin from "firebase-admin";
import * as fs from "fs";
import * as path from "path";

// src/services/firebase.service.ts

let initialized = false;
let resolvedStorageBucket = "";

const resolveStorageBucket = (projectId?: string): string => {
  return ""; // Not using Firebase Storage
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
  });

  initialized = true;
  console.log("✅ Firebase Admin SDK initialized");
};

export const getFirestore = (): admin.firestore.Firestore => {
  return admin.firestore();
};

export const getAuth = (): admin.auth.Auth => {
  return admin.auth();
};

export const getStorageBucketName = (): string => {
  return "";
};
