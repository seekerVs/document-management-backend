import { Router } from "express";
import {
  getGuestRequestDetails,
  getGuestDocumentBytes,
  submitGuestSignature,
  resendGuestSigningLink,
} from "../controllers/signing.controller.js";

const router = Router();

// These routes are PUBLIC (no API key required)
// but they require a valid UUID token in the query params

// GET /api/v1/guest/request-details?token=xxx
router.get("/request-details", getGuestRequestDetails);

// GET /api/v1/guest/document-bytes?token=xxx
router.get("/document-bytes", getGuestDocumentBytes);

// POST /api/v1/guest/submit-signature?token=xxx
router.post("/submit-signature", submitGuestSignature);

// POST /api/v1/guest/resend-link?token=xxx
router.post("/resend-link", resendGuestSigningLink);

export default router;
