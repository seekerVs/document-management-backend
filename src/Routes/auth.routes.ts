import { Router } from "express";
import rateLimit from "express-rate-limit";
import { validateBody, validateEmail } from "../Middleware/validate.middleware";
import {
  resetPassword,
  sendOtp,
  verifyOtpCode,
} from "../Controllers/auth.controller";

// src/routes/auth.routes.ts

const router = Router();

// Rate limit OTP sends — max 5 per 15 minutes per IP
const otpRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: {
    success: false,
    message: "Too many requests. Please wait before requesting another code.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// POST /api/auth/send-otp
router.post(
  "/send-otp",
  otpRateLimit,
  validateBody(["email"]),
  validateEmail,
  sendOtp,
);

// POST /api/auth/verify-otp
router.post(
  "/verify-otp",
  validateBody(["email", "code"]),
  validateEmail,
  verifyOtpCode,
);

// POST /api/auth/reset-password
router.post(
  "/reset-password",
  validateBody(["email", "code", "newPassword"]),
  validateEmail,
  resetPassword,
);

export default router;
