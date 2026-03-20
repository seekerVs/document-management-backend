import { Router } from "express";
import multer from "multer";
import path from "path";
import {
  deleteFile,
  signedUrl,
  uploadFile,
} from "../controllers/storage.controller";

const router = Router();

// Store file in memory buffer — no temp files on disk
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    const allowedMimes = [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/jpg",
    ];
    const allowedExts = [".pdf", ".jpg", ".jpeg", ".png"];
    const ext = path.extname(file.originalname).toLowerCase();

    if (allowedMimes.includes(file.mimetype) || allowedExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error("File type not allowed. Only PDF and images are accepted."));
    }
  },
});

router.post("/upload", upload.single("file"), uploadFile);
router.get("/signed-url", signedUrl);
router.delete("/delete", deleteFile);

export default router;
