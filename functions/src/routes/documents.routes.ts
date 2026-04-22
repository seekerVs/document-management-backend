import { Router } from "express";
import multer from "multer";
import { convertToPdf } from "../controllers/documents.controller.js";

// eslint-disable-next-line new-cap
const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

router.post("/convert-to-pdf", upload.single("file"), convertToPdf);

export default router;
