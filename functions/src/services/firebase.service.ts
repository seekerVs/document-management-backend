import admin from "firebase-admin";
import {
  getFirestore as adminGetFirestore,
  Firestore,
} from "firebase-admin/firestore";
import { getAuth as adminGetAuth, Auth } from "firebase-admin/auth";

import fs from "fs";

let initialized = false;

export const initFirebase = (): void => {
  if (initialized) return;

  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  console.log(`[Firebase Init] GOOGLE_APPLICATION_CREDENTIALS path: ${credPath}`);
  
  if (credPath) {
    console.log(`[Firebase Init] Does credential file exist? ${fs.existsSync(credPath)}`);
  }

  admin.initializeApp();

  initialized = true;
  console.log("Firebase Admin SDK initialized");
};

export const getFirestore = (): Firestore => {
  return adminGetFirestore();
};

export const getAuth = (): Auth => {
  return adminGetAuth();
};

export const getStorageBucketName = (): string => {
  return "";
};
