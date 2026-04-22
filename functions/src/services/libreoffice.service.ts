import path from "node:path";
import { Effect } from "effect";
import { LibreOffice } from "effect-libreoffice";
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

export class LibreOfficeService {
  private readonly timeoutMs: number;
  private readonly maxConcurrency: number;

  private active = 0;
  private readonly waiters: Array<() => void> = [];

  constructor() {
    this.timeoutMs = environment.libreOfficeTimeoutMs;
    this.maxConcurrency = environment.libreOfficeMaxConcurrency;
  }

  async convertToPdfWithLibreOffice({
    fileBuffer,
    fileName,
    trace,
  }: ConvertToPdfParams): Promise<Buffer> {
    await this.acquireSlot();

    try {
      const conversionResult = await this.runConversionWithTimeout(
        fileBuffer,
        fileName
      );
      const pdfBytes = Buffer.from(conversionResult.data);

      if (!this.looksLikePdf(pdfBytes)) {
        throw new LibreOfficeConversionError(
          "INVALID_OUTPUT",
          "Converter output is not a valid PDF."
        );
      }

      if (trace) {
        console.log(
          `[LibreOfficeService] conversion completed trace=${trace} output=${conversionResult.filename}`
        );
      }

      return pdfBytes;
    } catch (error) {
      throw this.mapConversionError(error);
    } finally {
      this.releaseSlot();
    }
  }

  private async runConversionWithTimeout(
    fileBuffer: Buffer,
    fileName: string
  ): Promise<{ data: Uint8Array; filename: string }> {
    const inputFormat = this.inferInputFormat(fileName);
    const conversionEffect = Effect.gen(function* () {
      const libre = yield* LibreOffice.LibreOffice;
      return yield* libre.convert(
        fileBuffer,
        {
          outputFormat: "pdf",
          ...(inputFormat ? { inputFormat } : {}),
        },
        fileName
      );
    }).pipe(Effect.provide(LibreOffice.layer));

    const conversionPromise = Effect.runPromise(conversionEffect);
    let timer: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(
          new LibreOfficeConversionError(
            "TIMEOUT",
            `Conversion timed out after ${this.timeoutMs}ms.`
          )
        );
      }, this.timeoutMs);
    });

    try {
      return await Promise.race([conversionPromise, timeoutPromise]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private inferInputFormat(fileName: string): "doc" | "docx" | undefined {
    const ext = path.extname(fileName).replace(".", "").toLowerCase();
    if (ext === "doc" || ext === "docx") {
      return ext;
    }
    return undefined;
  }

  private mapConversionError(error: unknown): Error {
    if (error instanceof LibreOfficeConversionError) {
      return error;
    }

    if (error instanceof LibreOffice.LibreOfficeError) {
      switch (error.code) {
        case "CORRUPTED_DOCUMENT":
        case "PASSWORD_REQUIRED":
        case "INVALID_INPUT":
        case "UNSUPPORTED_FORMAT":
          return new LibreOfficeConversionError("UNPROCESSABLE", error.message);
        case "WASM_NOT_INITIALIZED":
        case "LOAD_FAILED":
        case "PEER_DEPENDENCY_IMPORT_FAILED":
          return new LibreOfficeConversionError(
            "NO_BINARY",
            "WASM converter is not configured correctly."
          );
        case "CONVERSION_FAILED":
        case "UNKNOWN":
        default:
          return new LibreOfficeConversionError(
            "CONVERSION_FAILED",
            error.message
          );
      }
    }

    if (error instanceof Error) {
      return new LibreOfficeConversionError("CONVERSION_FAILED", error.message);
    }

    return new LibreOfficeConversionError(
      "CONVERSION_FAILED",
      "Unknown conversion error."
    );
  }

  private looksLikePdf(bytes: Buffer): boolean {
    /**
     * Validates that a buffer contains a valid PDF by checking the PDF header signature.
     * @param bytes - The file buffer to validate
     * @returns True if the buffer appears to be a valid PDF
     */
    if (bytes.length < 4) return false;
    return (
      bytes[0] === 0x25 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x44 &&
      bytes[3] === 0x46
    );
  }

  private async acquireSlot(): Promise<void> {
    /**
     * Acquires a concurrency slot for LibreOffice conversion.
     * Waits if maximum concurrency is reached.
     */
    if (this.active < this.maxConcurrency) {
      this.active += 1;
      return;
    }

    await new Promise<void>((resolve) => this.waiters.push(resolve));
    this.active += 1;
  }

  private releaseSlot(): void {
    /**
     * Releases a concurrency slot and processes the next queued operation if any.
     */
    this.active = Math.max(0, this.active - 1);
    const next = this.waiters.shift();
    if (next) next();
  }
}
