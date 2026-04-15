import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { downloadFromStorage } from "./supabase.service.js";

interface FlattenParams {
  storagePath: string;
  documentId: string;
  signers: any[];
}

export class PdfService {
  /**
   * Downloads the base PDF, embeds all fields/signatures, and returns the flattened PDF buffer.
   */
  async flattenDocument({
    storagePath,
    documentId,
    signers,
  }: FlattenParams): Promise<Buffer> {
    try {
      console.log(`[PdfService] Flattening document: ${storagePath} (${documentId})`);
      
      // 1. Download original document from Supabase
      const basePdfBuffer = await downloadFromStorage(storagePath);
      
      // 2. Load the PDF document
      const pdfDoc = await PDFDocument.load(basePdfBuffer);
      const pages = pdfDoc.getPages();
      
      // 3. Embed a standard font for text fields
      const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

      // Iterate over each signer to embed their fields
      for (const signer of signers) {
        if (!signer.fields || signer.fields.length === 0) continue;

        // Filter fields for this document
        // Fallback: If documentId is null/undefined in field, assume it belongs to this doc if doc array is empty or this is the only doc.
        // But more reliably, we just check for match or absence.
        const documentFields = signer.fields.filter((f: any) => 
          !f.documentId || f.documentId === documentId
        );

        if (documentFields.length === 0) continue;

        // If signer has a signature image, we need to fetch it to embed
        let signatureImageBytes: ArrayBuffer | null = null;
        let signatureImageEmbed: any = null;
        
        // ... (rest of the signature image fetching logic)
        if (signer.signatureImageUrl) {
          try {
            const resp = await fetch(signer.signatureImageUrl);
            if (resp.ok) {
              signatureImageBytes = await resp.arrayBuffer();
              try {
                signatureImageEmbed = await pdfDoc.embedPng(signatureImageBytes);
              } catch (e) {
                signatureImageEmbed = await pdfDoc.embedJpg(signatureImageBytes);
              }
            }
          } catch (error) {
            console.error(`[PdfService] Error fetching signature image:`, error);
          }
        }

        // Now process every field for this document
        for (const field of documentFields) {
          const pageIndex = field.page; // 0-indexed mapped directly
          if (pageIndex < 0 || pageIndex >= pages.length) {
             console.warn(`[PdfService] Invalid page index ${pageIndex}`);
             continue;
          }
          const page = pages[pageIndex];
          const pageW = page.getWidth();
          const pageH = page.getHeight();

          // Calculate absolute dimensions (points)
          const fieldW = field.width * pageW;
          const fieldH = field.height * pageH;

          // x is straightforward
          const x = field.x * pageW;

          // y needs to be converted from Top-Left to Bottom-Left
          // In Top-Left, y = 0 is the top of the page.
          // In Bottom-Left, y = pageH is the top of the page.
          // So pdf_y = pageH - (top_left_y) - fieldHeight
          const top_left_y = field.y * pageH;
          const y = pageH - top_left_y - fieldH;

          if (field.type === "signature" || field.type === "initials") {
            if (signatureImageEmbed) {
              page.drawImage(signatureImageEmbed, {
                x,
                y,
                width: fieldW,
                height: fieldH,
              });
            } else {
               // Fallback: draw text if no signature image found
               page.drawText(signer.signerName || "Signed", {
                  x,
                  y: y + fieldH / 2,
                  size: Math.min(12, fieldH * 0.8),
                  font: helveticaFont,
                  color: rgb(0, 0, 0),
               });
            }
          } else if (field.type === "textbox" || field.type === "dateSigned") {
             const textValue = field.value || (field.type === "dateSigned" ? new Date().toLocaleDateString() : "");
             
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
      
      console.log(`[PdfService] Document successfully flattened.`);
      return Buffer.from(pdfBytes);

    } catch (error) {
      console.error("[PdfService] Error flattening document:", error);
      throw error;
    }
  }
}
