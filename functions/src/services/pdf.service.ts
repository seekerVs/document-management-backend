import { PDFDocument, PDFImage, rgb, StandardFonts } from "pdf-lib";
import { downloadFromStorage } from "./supabase.service.js";

interface FlattenParams {
  storagePath: string;
  documentId: string;
  signers: FlattenSigner[];
  totalDocuments?: number;
}

interface FlattenField {
  fieldId?: string;
  type?: "signature" | "textbox";
  documentId?: string;
  page?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  value?: string;
}

interface FlattenSigner {
  signerName?: string;
  signatureImageUrl?: string;
  fields?: FlattenField[];
}

const normalizeDocRef = (value: unknown): string => {
  if (typeof value !== "string") return "";
  // Strip duplicate disambiguator from viewer IDs (e.g. library:abc#1)
  const withoutSuffix = value.replace(/#\d+$/, "");
  // Normalize known prefixes used by clients
  if (withoutSuffix.startsWith("library:")) {
    return withoutSuffix.substring("library:".length);
  }
  if (withoutSuffix.startsWith("storage:")) {
    return withoutSuffix.substring("storage:".length);
  }
  if (
    withoutSuffix.startsWith("local:") ||
    withoutSuffix.startsWith("legacy:")
  ) {
    return withoutSuffix;
  }
  return withoutSuffix;
};

export class PdfService {
  /**
   * Downloads the base PDF, embeds all fields/signatures, and returns the flattened PDF buffer.
   */
  async flattenDocument({
    storagePath,
    documentId,
    signers,
    totalDocuments = 1,
  }: FlattenParams): Promise<Buffer> {
    try {
      console.log(
        `[PdfService] Flattening document: ${storagePath} (${documentId})`
      );

      // 1. Download original document from Supabase
      const basePdfBuffer = await downloadFromStorage(storagePath);

      // 2. Load the PDF document
      const pdfDoc = await PDFDocument.load(basePdfBuffer);
      const pages = pdfDoc.getPages();
      const imageEmbedCache = new Map<string, PDFImage | null>();

      // 3. Embed a standard font for text fields
      const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

      const loadSignatureImage = async (
        ref: string
      ): Promise<PDFImage | null> => {
        if (!ref) return null;
        if (imageEmbedCache.has(ref)) {
          return imageEmbedCache.get(ref) ?? null;
        }

        try {
          let imageBytes: Uint8Array;

          if (/^https?:\/\//i.test(ref)) {
            const resp = await fetch(ref);
            if (!resp.ok) {
              imageEmbedCache.set(ref, null);
              return null;
            }
            imageBytes = new Uint8Array(await resp.arrayBuffer());
          } else {
            imageBytes = new Uint8Array(await downloadFromStorage(ref));
          }

          let embedded: PDFImage;
          try {
            embedded = await pdfDoc.embedPng(imageBytes);
          } catch {
            embedded = await pdfDoc.embedJpg(imageBytes);
          }
          imageEmbedCache.set(ref, embedded);
          return embedded;
        } catch (error) {
          console.error("[PdfService] Error loading signature image:", error);
          imageEmbedCache.set(ref, null);
          return null;
        }
      };

      // Iterate over each signer to embed their fields
      for (const signer of signers) {
        if (!signer.fields || signer.fields.length === 0) continue;

        // Filter fields for this document
        // Fallback: If documentId is null/undefined in field, assume it belongs to this doc if doc array is empty or this is the only doc.
        // But more reliably, we just check for match or absence.
        const normalizedTargetDocId = normalizeDocRef(documentId);
        let documentFields = signer.fields.filter((f) => {
          const fieldDocRef = normalizeDocRef(f.documentId);
          return !fieldDocRef || fieldDocRef === normalizedTargetDocId;
        });

        // Backward compatibility for legacy single-document requests where client sent prefixed/local IDs.
        if (documentFields.length === 0 && totalDocuments === 1) {
          documentFields = signer.fields;
        }

        if (documentFields.length === 0) continue;

        // Now process every field for this document
        for (const field of documentFields) {
          const pageIndex = Number(field.page);
          if (
            !Number.isInteger(pageIndex) ||
            pageIndex < 0 ||
            pageIndex >= pages.length
          ) {
            console.warn(`[PdfService] Invalid page index ${pageIndex}`);
            continue;
          }
          const page = pages[pageIndex];
          const pageW = page.getWidth();
          const pageH = page.getHeight();

          const normalizedW = Number(field.width);
          const normalizedH = Number(field.height);
          const normalizedX = Number(field.x);
          const normalizedY = Number(field.y);

          if (
            !Number.isFinite(normalizedW) ||
            !Number.isFinite(normalizedH) ||
            !Number.isFinite(normalizedX) ||
            !Number.isFinite(normalizedY) ||
            normalizedW <= 0 ||
            normalizedH <= 0
          ) {
            console.warn(
              `[PdfService] Invalid field geometry for ${field.fieldId ?? "unknown"}`
            );
            continue;
          }

          // Calculate absolute dimensions (points)
          // Match signing UI dimension constraints for better visual parity.
          const isRect = field.type === "textbox";
          const isSignature = field.type === "signature";
          const maxSigW = 120;
          const maxFieldW = 50;
          const maxFieldH = 50;
          const maxRectW = 100;
          const maxRectH = 28;

          const rawFieldW = normalizedW * pageW;
          const rawFieldH = normalizedH * pageH;

          const fieldW = Math.min(
            Math.max(rawFieldW, 20),
            isSignature ? maxSigW : isRect ? maxRectW : maxFieldW
          );
          const fieldH = Math.min(
            Math.max(rawFieldH, 20),
            isRect ? maxRectH : maxFieldH
          );

          // x is straightforward
          const x = normalizedX * pageW;

          // y needs to be converted from Top-Left to Bottom-Left
          // In Top-Left, y = 0 is the top of the page.
          // In Bottom-Left, y = pageH is the top of the page.
          // So pdf_y = pageH - (top_left_y) - fieldHeight
          const topLeftY = normalizedY * pageH;
          const y = pageH - topLeftY - fieldH;

          if (field.type === "signature") {
            const imageRef =
              typeof field.value === "string" && field.value.trim().length > 0
                ? field.value.trim()
                : signer.signatureImageUrl;

            const signatureImageEmbed = imageRef
              ? await loadSignatureImage(imageRef)
              : null;

            if (signatureImageEmbed) {
              page.drawImage(signatureImageEmbed, {
                x,
                y,
                width: fieldW,
                height: fieldH,
              });
            } else {
              // Fallback: draw text if no signature image found
              page.drawText(signer.signerName ?? "Signed", {
                x,
                y: y + fieldH / 2,
                size: Math.min(12, fieldH * 0.8),
                font: helveticaFont,
                color: rgb(0, 0, 0),
              });
            }
          } else if (field.type === "textbox") {
            const textValue = String(field.value ?? "");

            // Draw text box
            // A simple heuristic for font size based on box height wrapper
            const fontSize = Math.min(12, fieldH * 0.8);

            page.drawText(textValue, {
              x: x + 2, // Slight padding
              y: y + (fieldH - fontSize) / 2, // Center vertically
              size: fontSize,
              font: helveticaFont,
              color: rgb(0, 0, 0),
            });
          }
        }
      } // End of Signer Loop

      // 4. Serialize the PDFDocument to bytes
      const pdfBytes = await pdfDoc.save();

      console.log("[PdfService] Document successfully flattened.");
      return Buffer.from(pdfBytes);
    } catch (error) {
      console.error("[PdfService] Error flattening document:", error);
      throw error;
    }
  }
}
