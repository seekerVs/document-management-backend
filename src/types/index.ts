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

export interface UploadFileResponse {
  storagePath: string;
  fileSizeBytes: number;
}

export interface SignedUrlResponse {
  url: string;
}

// Signature field placed on PDF
export interface SignatureFieldPayload {
  fieldId: string;
  type: "signature" | "initials" | "dateSigned" | "textbox";
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  value?: string;
}

// Single signer in the create request payload
export interface SignerPayload {
  signerEmail: string;
  signerName: string;
  order: number;
  role: "needsToSign" | "receivesACopy";
  fields: SignatureFieldPayload[];
}

// POST /api/signing/create-request body
export interface CreateSignatureRequestBody {
  requestedByUid: string;
  requesterName: string;
  documentId: string;
  documentName: string;
  documentUrl: string;
  storagePath: string;
  signers: SignerPayload[];
  signingOrderEnabled: boolean;
}
