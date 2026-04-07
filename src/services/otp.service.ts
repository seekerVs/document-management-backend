import * as admin from "firebase-admin";
import { getFirestore, getAuth } from "./firebase.service.js";
import { OtpRecord } from "../types/index.js";

const OTP_COLLECTION = "password_reset_otps";

//Generate a random N-digit OTP
export const generateOtp = (length: number = 6): string => {
  const digits = "0123456789";
  let otp = "";
  for (let i = 0; i < length; i++) {
    otp += digits[Math.floor(Math.random() * digits.length)];
  }
  return otp;
};

// ─── Check if email is registered in Firebase Auth ───────────────────────────

export const isEmailRegistered = async (email: string): Promise<boolean> => {
  try {
    await getAuth().getUserByEmail(email);
    return true;
  } catch (error: any) {
    if (error.code === "auth/user-not-found") return false;
    throw error;
  }
};

// ─── Store OTP in Firestore ───────────────────────────────────────────────────

export const storeOtp = async (
  email: string,
  code: string,
  expiryMinutes: number,
): Promise<void> => {
  const db = getFirestore();
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + expiryMinutes);

  // Use email as doc ID so there's only one active OTP per email
  await db
    .collection(OTP_COLLECTION)
    .doc(email)
    .set({
      email,
      code,
      expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
      used: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    } as Omit<OtpRecord, "createdAt"> & {
      createdAt: admin.firestore.FieldValue;
    });
};

// ─── Verify OTP ───────────────────────────────────────────────────────────────

export type OtpVerifyResult =
  | "valid"
  | "not_found"
  | "expired"
  | "already_used"
  | "wrong_code";

export const verifyOtp = async (
  email: string,
  code: string,
): Promise<OtpVerifyResult> => {
  const db = getFirestore();
  const doc = await db.collection(OTP_COLLECTION).doc(email).get();

  if (!doc.exists) return "not_found";

  const record = doc.data() as OtpRecord;

  if (record.used) return "already_used";

  const now = new Date();
  const expiresAt = record.expiresAt.toDate();
  if (now > expiresAt) return "expired";

  if (record.code !== code) return "wrong_code";

  return "valid";
};

// ─── Mark OTP as used after password reset ────────────────────────────────────

export const invalidateOtp = async (email: string): Promise<void> => {
  const db = getFirestore();
  await db.collection(OTP_COLLECTION).doc(email).update({ used: true });
};
