import admin from "firebase-admin";
import {
  getFirestore as adminGetFirestore,
  Firestore,
} from "firebase-admin/firestore";
import { getAuth as adminGetAuth, Auth } from "firebase-admin/auth";

let initialized = false;

export const initFirebase = (): void => {
  if (initialized) return;

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
