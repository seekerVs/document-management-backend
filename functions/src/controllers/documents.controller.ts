import { Request, Response } from "express";
import {
  DocumentConversionError,
  DocumentConversionService,
} from "../services/document-conversion.service.js";

const allowedDocExtensions = [".doc", ".docx"];
const allowedDocMimeTypes = [
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/octet-stream",
];

const documentConversionService = new DocumentConversionService();

const hasAllowedExtension = (fileName: string): boolean => {
  const lower = fileName.toLowerCase();
  return allowedDocExtensions.some((ext) => lower.endsWith(ext));
};

const generateTrace = (): string =>
  `doc-convert-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

// POST /api/documents/convert-to-pdf
export const convertToPdf = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const file = req.file;

    if (!file) {
      res.status(400).json({ success: false, message: "No file provided." });
      return;
    }

    if (!hasAllowedExtension(file.originalname)) {
      res.status(400).json({
        success: false,
        message: "Only DOC and DOCX files are accepted.",
      });
      return;
    }

    if (!allowedDocMimeTypes.includes(file.mimetype)) {
      res.status(400).json({
        success: false,
        message: "Unsupported document MIME type.",
      });
      return;
    }

    const trace = generateTrace();
    const pdfBytes = await documentConversionService.convertToPdf({
      fileBuffer: file.buffer,
      fileName: file.originalname,
      trace,
    });

    const outputBaseName = file.originalname.replace(/\.[^/.]+$/, "");
    const outputName = `${outputBaseName || "Document"}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Length", pdfBytes.length.toString());
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${outputName}"`
    );
    res.setHeader("Conversion-Trace", trace);
    res.status(200).send(pdfBytes);
  } catch (error) {
    if (error instanceof DocumentConversionError) {
      switch (error.code) {
        case "TIMEOUT":
          res.status(503).json({
            success: false,
            message: "Document conversion timed out. Please try again.",
          });
          return;
        case "NO_BINARY":
          res.status(500).json({
            success: false,
            message: "Conversion service is not configured correctly.",
          });
          return;
        case "UNPROCESSABLE":
          res.status(422).json({
            success: false,
            message:
              "The document could not be converted. The file may be corrupted or password-protected.",
          });
          return;
        case "INVALID_OUTPUT":
        case "CONVERSION_FAILED":
          res.status(502).json({
            success: false,
            message: "Document conversion failed. Please try again.",
          });
          return;
      }
    }

    console.error("[convertToPdf] Error:", error);
    res.status(502).json({
      success: false,
      message: "Document conversion failed. Please try again.",
    });
  }
};
