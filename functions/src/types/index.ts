import { Timestamp } from "firebase-admin/firestore";

export interface ApiResponse<T = null> {
  success: boolean;
  message: string;
  data?: T;
}

export interface OtpRecord {
  email: string;
  code: string;
  expiresAt: Timestamp;
  used: boolean;
  createdAt: Timestamp;
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
  requesterEmail?: string;
  message?: string;
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
  type: "signature" | "initials" | "textbox";
  documentId: string;
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

export interface DocumentPayload {
  documentId: string;
  documentName: string;
  documentUrl: string;
  storagePath: string;
}

// POST /api/signing/create-request body
export interface CreateSignatureRequestBody {
  requestedByUid: string;
  requesterName: string;
  documents: DocumentPayload[];
  signers: SignerPayload[];
  signingOrderEnabled: boolean;
  message?: string;
  requesterEmail?: string;
}

// POST /api/signing/submit-signature body (Authenticated mobile)
export interface SubmitSignatureRequest {
  requestId: string;
  signerEmail: string;
  signerName: string;
  updatedFields: SignatureFieldPayload[];
  signatureImageUrl?: string;
  signerUid?: string;
}

// POST /api/v1/guest/submit-signature body (Web guest)
export interface SubmitGuestSignatureRequest {
  signatures: SignatureFieldPayload[]; // Array of filled fields
}

export type SignatureRequestStatus =
  | "pending"
  | "inProgress"
  | "completed"
  | "declined"
  | "expired";

export type SignerStatus = "pending" | "signed" | "declined";

export type SignerRole = "needsToSign" | "receivesACopy";
