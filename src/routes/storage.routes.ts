import express, { Router } from "express";
import multer from "multer";
import path from "path";
import {
  deleteFile,
  signedUrl,
  uploadFile,
} from "../controllers/storage.controller.js";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    const allowedMimes = [
      "application/pdf",
      "image/jpeg",
      "image/jpg",
      "image/png",
    ];
    const allowedExts = [".pdf", ".jpg", ".jpeg", ".png"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedMimes.includes(file.mimetype) || allowedExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error("Only PDF files and images (JPG, PNG) are accepted."));
    }
  },
});

router.post("/upload", upload.single("file"), uploadFile);
router.get("/signed-url", signedUrl);
// express.json() applied explicitly — multer doesn't parse JSON bodies
router.post("/delete", express.json(), deleteFile);

export default router;
