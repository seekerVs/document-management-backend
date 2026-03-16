import { Router } from "express";

import { validateBody } from "../Middleware/validate.middleware";
import {
  sendSigningLink,
  validateToken,
} from "../Controllers/signing.controller";

// src/routes/signing.routes.ts

const router = Router();

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

// GET /api/signing/validate-token?token=xxx
router.get("/validate-token", validateToken);

export default router;
