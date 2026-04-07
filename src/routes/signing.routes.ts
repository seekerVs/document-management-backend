import { Router } from "express";
import { validateBody } from "../middleware/validate.middleware.js";
import {
  createSignatureRequest,
  expireRequests,
  sendSigningLink,
  validateToken,
} from "../controllers/signing.controller.js";

const router = Router();

// POST /api/signing/create-request
router.post(
  "/create-request",
  validateBody([
    "requestedByUid",
    "requesterName",
    "documentId",
    "documentName",
    "documentUrl",
    "storagePath",
    "signers",
  ]),
  createSignatureRequest,
);

// POST /api/signing/send-link
router.post(
  "/send-link",
  validateBody([
    "documentId",
    "requestId",
    "signerEmail",
    "requesterName",
    "documentName",
  ]),
  sendSigningLink,
);

// POST /api/signing/expire-requests — called by Render cron job
router.post("/expire-requests", expireRequests);

// GET /api/signing/validate-token?token=xxx
router.get("/validate-token", validateToken);

export default router;
