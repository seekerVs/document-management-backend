// src/types/index.ts

import * as admin from "firebase-admin";

export interface ApiResponse<T = null> {
  success: boolean;
  message: string;
  data?: T;
}

export interface OtpRecord {
  email: string;
  code: string;
  expiresAt: admin.firestore.Timestamp;
  used: boolean;
  createdAt: admin.firestore.Timestamp;
}

export interface SendOtpRequest {
  email: string;
}

export interface VerifyOtpRequest {
  email: string;
  code: string;
}

export interface ResetPasswordRequest {
  email: string;
  code: string;
  newPassword: string;
}

export interface SendSigningLinkRequest {
  documentId: string;
  requestId: string;
  signerEmail: string;
  signerName?: string;
  requesterName: string;
  documentName: string;
  signingToken: string;
  signingUrl: string;
}
