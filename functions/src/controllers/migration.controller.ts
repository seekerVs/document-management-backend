import { Request, Response } from "express";
import { MigrationService } from "../services/migration.service.js";
import { ApiResponse } from "../types/index.js";

const migrationService = new MigrationService();

export const backfillUsers = async (
  _req: Request,
  res: Response
): Promise<void> => {
  try {
    const results = await migrationService.backfillUsers();
    res.status(200).json({
      success: true,
      message: "User backfill migration completed.",
      data: results,
    } as ApiResponse<typeof results>);
  } catch (error) {
    console.error("[backfillUsers] Error:", error);
    res.status(500).json({
      success: false,
      message: "Migration failed. Check server logs.",
    } as ApiResponse);
  }
};
