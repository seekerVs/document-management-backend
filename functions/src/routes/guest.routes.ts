import { Router } from "express";
import {
  getGuestRequestDetails,
  getGuestDocumentBytes,
  submitGuestSignature,
  resendGuestSigningLink,
  getCompletedRequestDetails,
  getCompletedDocumentBytes,
} from "../controllers/signing.controller.js";

// eslint-disable-next-line new-cap
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

// GET /api/v1/guest/completed-details?requestId=xxx
router.get("/completed-details", getCompletedRequestDetails);

// GET /api/v1/guest/completed-bytes?requestId=xxx
router.get("/completed-bytes", getCompletedDocumentBytes);

export default router;
