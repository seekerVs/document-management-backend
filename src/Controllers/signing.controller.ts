import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import * as admin from 'firebase-admin';
import { getFirestore } from '../services/firebase.service';
import { sendSigningLinkEmail } from '../services/email.service';
import { ApiResponse, SendSigningLinkRequest } from '../types';

// src/controllers/signing.controller.ts

// ─── POST /api/signing/send-link ──────────────────────────────────────────────
// Generates a signing token, stores it in Firestore, sends email to signer

export const sendSigningLink = async (req: Request, res: Response): Promise<void> => {
  const {
    documentId,
    requestId,
    signerEmail,
    signerName,
    requesterName,
    documentName,
  } = req.body as SendSigningLinkRequest;

  try {
    const db = getFirestore();

    // Generate a secure one-time token
    const token = uuidv4();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 72); // 72 hour expiry

    // Store token in Firestore
    await db.collection('signing_tokens').doc(token).set({
      token,
      documentId,
      requestId,
      signerEmail: signerEmail.trim().toLowerCase(),
      expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
      used: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Build the signing URL pointing to your Flutter web app
    const baseUrl = process.env.SIGNING_BASE_URL ?? 'https://your-web-app.com';
    const signingUrl = `${baseUrl}/sign?token=${token}`;

    // Send email
    await sendSigningLinkEmail(
      signerEmail.trim(),
      signerName ?? '',
      requesterName,
      documentName,
      signingUrl
    );

    res.status(200).json({
      success: true,
      message: 'Signing link sent successfully.',
      data: { token },
    } as ApiResponse<{ token: string }>);
  } catch (error) {
    console.error('[sendSigningLink] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send signing link.',
    } as ApiResponse);
  }
};

// ─── GET /api/signing/validate-token ─────────────────────────────────────────
// Called by Flutter web app on load to validate the token in the URL

export const validateToken = async (req: Request, res: Response): Promise<void> => {
  const { token } = req.query;

  if (!token || typeof token !== 'string') {
    res.status(400).json({
      success: false,
      message: 'Token is required.',
    } as ApiResponse);
    return;
  }

  try {
    const db = getFirestore();
    const doc = await db.collection('signing_tokens').doc(token).get();

    if (!doc.exists) {
      res.status(404).json({
        success: false,
        message: 'Invalid signing link.',
      } as ApiResponse);
      return;
    }

    const data = doc.data()!;

    if (data.used) {
      res.status(400).json({
        success: false,
        message: 'This signing link has already been used.',
      } as ApiResponse);
      return;
    }

    const expiresAt = data.expiresAt.toDate() as Date;
    if (new Date() > expiresAt) {
      res.status(400).json({
        success: false,
        message: 'This signing link has expired.',
      } as ApiResponse);
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Token is valid.',
      data: {
        documentId: data.documentId,
        requestId: data.requestId,
        signerEmail: data.signerEmail,
      },
    } as ApiResponse);
  } catch (error) {
    console.error('[validateToken] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Token validation failed.',
    } as ApiResponse);
  }
};
