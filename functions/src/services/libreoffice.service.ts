import axios from "axios";
import { environment } from "../config/environment.js";

export type LibreOfficeConversionErrorCode =
  | "TIMEOUT"
  | "NO_BINARY"
  | "UNPROCESSABLE"
  | "CONVERSION_FAILED"
  | "INVALID_OUTPUT";

export class LibreOfficeConversionError extends Error {
  readonly code: LibreOfficeConversionErrorCode;

  constructor(code: LibreOfficeConversionErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

interface ConvertToPdfParams {
  fileBuffer: Buffer;
  fileName: string;
  trace?: string;
}

/**
 * Service to handle document conversion using a remote Gotenberg instance.
 * This approach is much more stable than running WASM locally in a 
 * memory-constrained environment like Render Free Tier.
 */
export class LibreOfficeService {
  private readonly gotenbergUrl: string;

  constructor() {
    // Ensure URL doesn't have trailing slash for consistency
    this.gotenbergUrl = environment.gotenbergUrl.replace(/\/$/, "");
  }

  async convertToPdfWithLibreOffice({
    fileBuffer,
    fileName,
    trace,
  }: ConvertToPdfParams): Promise<Buffer> {
    try {
      if (trace) {
        console.log(`[LibreOfficeService] Sending to Gotenberg: ${fileName} (trace=${trace})`);
      }

      // Gotenberg 8 LibreOffice conversion endpoint
      const endpoint = `${this.gotenbergUrl}/forms/libreoffice/convert`;
      
      const formData = new FormData();
      // Gotenberg expects 'files' field for the document
      // Convert Buffer to Uint8Array for Blob compatibility
      const blob = new Blob([new Uint8Array(fileBuffer)]);
      formData.append("files", blob, fileName);

      const response = await axios.post(endpoint, formData, {
        responseType: "arraybuffer",
        headers: {
          "Content-Type": "multipart/form-data",
        },
        // Use the configured timeout
        timeout: environment.libreOfficeTimeoutMs,
      });

      const pdfBytes = Buffer.from(response.data);

      if (!this.looksLikePdf(pdfBytes)) {
        throw new LibreOfficeConversionError(
          "INVALID_OUTPUT",
          "Gotenberg output is not a valid PDF."
        );
      }

      if (trace) {
        console.log(`[LibreOfficeService] conversion completed trace=${trace} size=${pdfBytes.length}`);
      }

      return pdfBytes;
    } catch (error) {
      throw this.mapError(error);
    }
  }

  private mapError(error: any): Error {
    if (error instanceof LibreOfficeConversionError) {
      return error;
    }

    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const message = error.response?.data?.toString() || error.message;

      console.error(`[LibreOfficeService] Gotenberg error (${status}):`, message);

      if (status === 415 || status === 422) {
        return new LibreOfficeConversionError("UNPROCESSABLE", "The file format is not supported or the file is corrupted.");
      }
      
      if (error.code === "ECONNABORTED") {
        return new LibreOfficeConversionError("TIMEOUT", "The conversion service timed out.");
      }

      return new LibreOfficeConversionError("CONVERSION_FAILED", `Conversion service error: ${message}`);
    }

    return new LibreOfficeConversionError("CONVERSION_FAILED", error instanceof Error ? error.message : "Unknown error during conversion");
  }

  private looksLikePdf(bytes: Buffer): boolean {
    if (bytes.length < 4) return false;
    return (
      bytes[0] === 0x25 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x44 &&
      bytes[3] === 0x46
    );
  }
}
