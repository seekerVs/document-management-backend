import { Request, Response, NextFunction } from "express";
import { ApiResponse } from "../types/index.js";

export const validateBody = (requiredFields: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const missing = requiredFields.filter(
      (field) => !req.body[field] || req.body[field].toString().trim() === ""
    );

    if (missing.length > 0) {
      res.status(400).json({
        success: false,
        message: `Missing required fields: ${missing.join(", ")}`,
      } as ApiResponse);
      return;
    }

    next();
  };
};

export const validateEmail = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const { email } = req.body;
  const emailRegex = /^[\w.-]+@[\w.-]+\.\w+$/;

  if (!email || !emailRegex.test(email.trim())) {
    res.status(400).json({
      success: false,
      message: "Invalid email address",
    } as ApiResponse);
    return;
  }

  next();
};
