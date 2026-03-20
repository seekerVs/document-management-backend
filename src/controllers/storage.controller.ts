import { Request, Response } from "express";
import { ApiResponse } from "../types";
import {
  deleteFromStorage,
  getSignedUrl,
  uploadToStorage,
} from "../services/supabase.service";

// POST /api/storage/upload
export const uploadFile = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const file = req.file;
    const uid = req.body.uid as string;

    if (!file) {
      res.status(400).json({ success: false, message: "No file provided." });
      return;
    }
    if (!uid) {
      res.status(400).json({ success: false, message: "uid is required." });
      return;
    }

    const storagePath = `${uid}/${Date.now()}_${file.originalname}`;
    await uploadToStorage(file.buffer, storagePath, file.mimetype);

    const response: ApiResponse<{
      storagePath: string;
      fileSizeBytes: number;
    }> = {
      success: true,
      message: "File uploaded successfully.",
      data: { storagePath, fileSizeBytes: file.size },
    };
    res.status(200).json(response);
  } catch (error) {
    console.error("[uploadFile] Error:", error);
    res
      .status(500)
      .json({ success: false, message: "Upload failed. Please try again." });
  }
};

// GET /api/storage/signed-url?path=uid123/file.pdf
export const signedUrl = async (req: Request, res: Response): Promise<void> => {
  try {
    const storagePath = req.query.path as string;
    if (!storagePath) {
      res.status(400).json({ success: false, message: "path is required." });
      return;
    }

    const url = await getSignedUrl(storagePath);
    const response: ApiResponse<{ url: string }> = {
      success: true,
      message: "Signed URL generated.",
      data: { url },
    };
    res.status(200).json(response);
  } catch (error) {
    console.error("[signedUrl] Error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to generate URL." });
  }
};

// DELETE /api/storage/delete
export const deleteFile = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { storagePath } = req.body as { storagePath: string };
    if (!storagePath) {
      res
        .status(400)
        .json({ success: false, message: "storagePath is required." });
      return;
    }

    await deleteFromStorage(storagePath);
    res.status(200).json({ success: true, message: "File deleted." });
  } catch (error) {
    console.error("[deleteFile] Error:", error);
    res.status(500).json({ success: false, message: "Failed to delete file." });
  }
};
