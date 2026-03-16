import { Request, Response, NextFunction } from "express";
import { ApiResponse } from "../Types";

// src/middleware/auth.middleware.ts
//
// Every request from the Flutter app must include:
// Header: x-api-key: <API_SECRET_KEY from .env>
// This prevents random internet traffic from hitting your endpoints.

export const validateApiKey = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const apiKey = req.headers["x-api-key"];
  const expectedKey = process.env.API_SECRET_KEY;

  if (!expectedKey) {
    console.error("API_SECRET_KEY is not set in environment variables");
    res.status(500).json({
      success: false,
      message: "Server configuration error",
    } as ApiResponse);
    return;
  }

  if (!apiKey || apiKey !== expectedKey) {
    res.status(401).json({
      success: false,
      message: "Unauthorized",
    } as ApiResponse);
    return;
  }

  next();
};
