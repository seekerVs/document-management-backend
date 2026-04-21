import { Router } from "express";
import multer from "multer";
import path from "path";
import { convertToPdf } from "../controllers/documents.controller.js";

// eslint-disable-next-line new-cap
const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExts = [".doc", ".docx"];

    if (!allowedExts.includes(ext)) {
      cb(new Error("Only DOC and DOCX files are accepted."));
      return;
    }

    cb(null, true);
  },
});

router.post("/convert-to-pdf", upload.single("file"), convertToPdf);

export default router;
