import path from "node:path";
import axios, { isAxiosError } from "axios";
import { environment } from "../config/environment.js";

export type DocumentConversionErrorCode =
  | "TIMEOUT"
  | "NO_BINARY"
  | "UNPROCESSABLE"
  | "CONVERSION_FAILED"
  | "INVALID_OUTPUT";

export class DocumentConversionError extends Error {
  readonly code: DocumentConversionErrorCode;

  constructor(code: DocumentConversionErrorCode, message: string) {
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
 * Service to handle document conversion using ConvertAPI.
 * This is a highly reliable cloud-based solution that bypasses
 * the memory limitations of Render.com.
 */
export class DocumentConversionService {
  private readonly secret: string;

  constructor() {
    this.secret = environment.convertApiSecret;
  }

  async convertToPdf({
    fileBuffer,
    fileName,
    trace,
  }: ConvertToPdfParams): Promise<Buffer> {
    try {
      if (!this.secret) {
        throw new DocumentConversionError(
          "NO_BINARY",
          "ConvertAPI Secret is not configured."
        );
      }

      if (trace) {
        console.log(
          `[DocumentConversionService] Sending to ConvertAPI: ${fileName} (trace=${trace})`
        );
      }

      const extension =
        path.extname(fileName).toLowerCase().replace(".", "") || "docx";
      // ConvertAPI endpoint format: /convert/{format}/to/pdf
      const endpoint = `https://v2.convertapi.com/convert/${extension}/to/pdf?Secret=${this.secret}`;

      const formData = new FormData();
      // ConvertAPI expects the file in the 'File' field
      const blob = new Blob([new Uint8Array(fileBuffer)]);
      formData.append("File", blob, fileName);

      const response = await axios.post(endpoint, formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
        timeout: environment.libreOfficeTimeoutMs,
      });

      // ConvertAPI returns a JSON with a Files array
      const result = response.data;
      if (!result.Files || result.Files.length === 0) {
        throw new DocumentConversionError(
          "CONVERSION_FAILED",
          "ConvertAPI returned no files."
        );
      }

      // The file data is returned as a Base64 string
      const base64Data = result.Files[0].FileData;
      const pdfBytes = Buffer.from(base64Data, "base64");

      if (!this.looksLikePdf(pdfBytes)) {
        throw new DocumentConversionError(
          "INVALID_OUTPUT",
          "ConvertAPI output is not a valid PDF."
        );
      }

      if (trace) {
        console.log(
          `[DocumentConversionService] conversion completed trace=${trace} size=${pdfBytes.length}`
        );
      }

      return pdfBytes;
    } catch (error) {
      throw this.mapError(error);
    }
  }

  private mapError(error: any): Error {
    if (error instanceof DocumentConversionError) {
      return error;
    }

    if (isAxiosError(error)) {
      const status = error.response?.status;
      // ConvertAPI often returns error details in JSON
      const message = error.response?.data?.Message || error.message;

      console.error(
        `[DocumentConversionService] ConvertAPI error (${status}):`,
        message
      );

      if (status === 401) {
        return new DocumentConversionError(
          "NO_BINARY",
          "Invalid ConvertAPI Secret."
        );
      }
      if (status === 402) {
        return new DocumentConversionError(
          "CONVERSION_FAILED",
          "ConvertAPI credit limit exceeded."
        );
      }
      if (status === 415 || status === 422) {
        return new DocumentConversionError(
          "UNPROCESSABLE",
          "Unsupported file format or corrupted file."
        );
      }

      return new DocumentConversionError(
        "CONVERSION_FAILED",
        `ConvertAPI error: ${message}`
      );
    }

    return new DocumentConversionError(
      "CONVERSION_FAILED",
      error instanceof Error ? error.message : "Unknown error during conversion"
    );
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
