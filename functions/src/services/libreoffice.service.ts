import path from "node:path";
// @ts-expect-error - wasmLoader lacks type declarations in the package but is required for initialization in this environment.
import wasmLoader from "@matbee/libreoffice-converter/wasm/loader";
import {
  createSubprocessConverter,
  type ILibreOfficeConverter,
} from "@matbee/libreoffice-converter/server";
import { ConversionError } from "@matbee/libreoffice-converter";
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

  /**
   * Singleton converter – initialized once on first use and reused for all
   * subsequent requests. 
   * 
   * We use the Subprocess-based converter for Render.com's memory-constrained 
   * environment (512MB). It runs the WASM module in a separate process, 
   * allowing for automatic restarts on memory errors without crashing the 
   * main web server.
   */
  private converterPromise: Promise<ILibreOfficeConverter> | null = null;

  constructor() {
    this.timeoutMs = environment.libreOfficeTimeoutMs;
    // On 512MB RAM, we force maxConcurrency to 1 to avoid OOM
    this.maxConcurrency = 1; 
  }

  private getConverter(): Promise<ILibreOfficeConverter> {
    if (!this.converterPromise) {
      console.log("[LibreOfficeService] Initializing Subprocess-based WASM converter...");
      
      this.converterPromise = createSubprocessConverter({ 
        wasmLoader,
        // Explicitly set the path to WASM files to avoid auto-detection issues on Render
        wasmPath: (wasmLoader as any).wasmDir,
        verbose: true,
        maxInitRetries: 3,
        restartOnMemoryError: true
      }).catch((err) => {
        console.error("[LibreOfficeService] Initialization failed:", err);
        this.converterPromise = null;
        throw err;
      });
    }
    return this.converterPromise;
  }

  async convertToPdfWithLibreOffice({
    fileBuffer,
    fileName,
    trace,
  }: ConvertToPdfParams): Promise<Buffer> {
    await this.acquireSlot();

    try {
      const converter = await this.getConverter();
      const pdfBytes = await this.runConversionWithTimeout(
        converter,
        fileBuffer,
        fileName
      );

      if (!this.looksLikePdf(pdfBytes)) {
        throw new LibreOfficeConversionError(
          "INVALID_OUTPUT",
          "Converter output is not a valid PDF."
        );
      }

      if (trace) {
        console.log(
          `[LibreOfficeService] conversion completed trace=${trace} size=${pdfBytes.length}`
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
    converter: ILibreOfficeConverter,
    fileBuffer: Buffer,
    fileName: string
  ): Promise<Buffer> {
    const inputFormat = this.inferInputFormat(fileName);

    const conversionPromise = converter
      .convert(fileBuffer, {
        outputFormat: "pdf",
        ...(inputFormat ? { inputFormat } : {}),
      })
      .then((result) => Buffer.from(result.data));

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

    if (error instanceof ConversionError) {
      switch (error.code) {
        case "CORRUPTED_DOCUMENT":
        case "PASSWORD_REQUIRED":
        case "INVALID_INPUT":
        case "UNSUPPORTED_FORMAT":
          return new LibreOfficeConversionError("UNPROCESSABLE", error.message);
        case "WASM_NOT_INITIALIZED":
        case "LOAD_FAILED":
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
    if (bytes.length < 4) return false;
    return (
      bytes[0] === 0x25 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x44 &&
      bytes[3] === 0x46
    );
  }

  private async acquireSlot(): Promise<void> {
    if (this.active < this.maxConcurrency) {
      this.active += 1;
      return;
    }

    await new Promise<void>((resolve) => this.waiters.push(resolve));
    this.active += 1;
  }

  private releaseSlot(): void {
    this.active = Math.max(0, this.active - 1);
    const next = this.waiters.shift();
    if (next) next();
  }
}
