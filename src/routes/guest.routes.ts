import { Router } from "express";
import {
  getGuestRequestDetails,
  getGuestDocumentBytes,
  submitGuestSignature,
} from "../controllers/signing.controller";

const router = Router();

// These routes are PUBLIC (no API key required)
// but they require a valid UUID token in the query params

// GET /api/v1/guest/request-details?token=xxx
router.get("/request-details", getGuestRequestDetails);

// GET /api/v1/guest/document-bytes?token=xxx
router.get("/document-bytes", getGuestDocumentBytes);

// POST /api/v1/guest/submit-signature?token=xxx
router.post("/submit-signature", submitGuestSignature);

export default router;
