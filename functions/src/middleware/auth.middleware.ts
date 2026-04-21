import { Request, Response, NextFunction } from "express";
import { ApiResponse } from "../types/index.js";
import { environment } from "../config/environment.js";

export const validateApiKey = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const apiKey = req.headers["x-api-key"];
  const expectedKey = environment.apiSecretKey;

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
