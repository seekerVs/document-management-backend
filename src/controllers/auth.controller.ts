import { Request, Response } from "express";
import {
  ApiResponse,
  SendOtpRequest,
  VerifyOtpRequest,
  ResetPasswordRequest,
} from "../types/index.js";
import {
  generateOtp,
  invalidateOtp,
  isEmailRegistered,
  storeOtp,
  verifyOtp,
} from "../services/otp.service.js";
import { sendOtpEmail } from "../services/email.service.js";
import { getAuth } from "../services/firebase.service.js";

const OTP_EXPIRY = parseInt(process.env.OTP_EXPIRY_MINUTES ?? "10");
const OTP_LENGTH = parseInt(process.env.OTP_LENGTH ?? "6");

// POST /api/auth/send-otp
// Checks if email is registered, generates OTP, sends email

export const sendOtp = async (req: Request, res: Response): Promise<void> => {
  const { email } = req.body as SendOtpRequest;

  try {
    const registered = await isEmailRegistered(email.trim().toLowerCase());

    if (!registered) {
      res.status(404).json({
        success: false,
        message: "No account found with this email address.",
      } as ApiResponse);
      return;
    }

    const code = generateOtp(OTP_LENGTH);
    await storeOtp(email.trim().toLowerCase(), code, OTP_EXPIRY);
    await sendOtpEmail(email.trim(), code, OTP_EXPIRY);

    res.status(200).json({
      success: true,
      message: `A ${OTP_LENGTH}-digit code has been sent to your email.`,
    } as ApiResponse);
  } catch (error) {
    console.error("[sendOtp] Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to send OTP. Please try again.",
    } as ApiResponse);
  }
};

// POST /api/auth/verify-otp
// Verifies OTP code — call this before showing the new password screen

export const verifyOtpCode = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { email, code } = req.body as VerifyOtpRequest;

  try {
    const result = await verifyOtp(email.trim().toLowerCase(), code.trim());

    switch (result) {
      case "valid":
        res.status(200).json({
          success: true,
          message: "Code verified successfully.",
        } as ApiResponse);
        return;

      case "wrong_code":
        res.status(400).json({
          success: false,
          message: "Incorrect code. Please try again.",
        } as ApiResponse);
        return;

      case "expired":
        res.status(400).json({
          success: false,
          message: "This code has expired. Please request a new one.",
        } as ApiResponse);
        return;

      case "already_used":
        res.status(400).json({
          success: false,
          message: "This code has already been used.",
        } as ApiResponse);
        return;

      case "not_found":
        res.status(404).json({
          success: false,
          message: "No reset code found for this email.",
        } as ApiResponse);
        return;
    }
  } catch (error) {
    console.error("[verifyOtpCode] Error:", error);
    res.status(500).json({
      success: false,
      message: "Verification failed. Please try again.",
    } as ApiResponse);
  }
};

// POST /api/auth/reset-password
// Verifies OTP one final time then updates password via Firebase Admin

export const resetPassword = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { email, code, newPassword } = req.body as ResetPasswordRequest;

  try {
    // Re-verify OTP before changing password
    const result = await verifyOtp(email.trim().toLowerCase(), code.trim());

    if (result !== "valid") {
      res.status(400).json({
        success: false,
        message: "Invalid or expired reset code.",
      } as ApiResponse);
      return;
    }

    if (!newPassword || newPassword.length < 6) {
      res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters.",
      } as ApiResponse);
      return;
    }

    // Get user from Firebase Auth
    const user = await getAuth().getUserByEmail(email.trim().toLowerCase());

    // Update password via Firebase Admin SDK
    await getAuth().updateUser(user.uid, { password: newPassword });

    // Invalidate OTP so it can't be reused
    await invalidateOtp(email.trim().toLowerCase());

    res.status(200).json({
      success: true,
      message: "Password updated successfully.",
    } as ApiResponse);
  } catch (error) {
    console.error("[resetPassword] Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to reset password. Please try again.",
    } as ApiResponse);
  }
};
