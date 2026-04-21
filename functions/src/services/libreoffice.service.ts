import { spawn } from "node:child_process";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
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
  private readonly binaryPath: string;
  private readonly timeoutMs: number;
  private readonly tempRootDir: string;
  private readonly maxConcurrency: number;

  private active = 0;
  private readonly waiters: Array<() => void> = [];

  constructor() {
    this.binaryPath = environment.libreOfficeBinaryPath;
    this.timeoutMs = environment.libreOfficeTimeoutMs;
    this.tempRootDir = environment.libreOfficeTempDir;
    this.maxConcurrency = environment.libreOfficeMaxConcurrency;
  }

  async convertToPdfWithLibreOffice({
    fileBuffer,
    fileName,
    trace,
  }: ConvertToPdfParams): Promise<Buffer> {
    await this.acquireSlot();

    let workDir = "";

    try {
      await mkdir(this.tempRootDir, { recursive: true });
      workDir = await mkdtemp(path.join(this.tempRootDir, "job-"));

      const safeInputName = this.sanitizeInputFileName(fileName);
      const inputPath = path.join(workDir, safeInputName);
      const outputName = `${path.basename(safeInputName, path.extname(safeInputName))}.pdf`;
      const outputPath = path.join(workDir, outputName);

      await writeFile(inputPath, fileBuffer);

      const stderr = await this.runLibreOffice(inputPath, workDir);

      await access(outputPath).catch(() => {
        throw new LibreOfficeConversionError(
          "INVALID_OUTPUT",
          "LibreOffice did not produce a PDF output file."
        );
      });

      const pdfBytes = await readFile(outputPath);

      if (!this.looksLikePdf(pdfBytes)) {
        throw new LibreOfficeConversionError(
          "INVALID_OUTPUT",
          "LibreOffice output is not a valid PDF."
        );
      }

      if (stderr.trim().length > 0) {
        console.warn(
          `[LibreOfficeService] conversion warnings trace=${trace ?? "n/a"}: ${stderr.trim()}`
        );
      }

      return pdfBytes;
    } finally {
      if (workDir) {
        await rm(workDir, { recursive: true, force: true });
      }
      this.releaseSlot();
    }
  }

  private async runLibreOffice(
    inputPath: string,
    outDir: string
  ): Promise<string> {
    const args = [
      "--headless",
      "--nologo",
      "--nodefault",
      "--nofirststartwizard",
      "--nolockcheck",
      "--convert-to",
      "pdf:writer_pdf_Export",
      "--outdir",
      outDir,
      inputPath,
    ];

    return await new Promise<string>((resolve, reject) => {
      const child = spawn(this.binaryPath, args, { windowsHide: true });

      let stderr = "";
      let timeoutTriggered = false;
      let hardKillTimer: NodeJS.Timeout | null = null;

      const timeout = setTimeout(() => {
        timeoutTriggered = true;
        child.kill("SIGTERM");
        hardKillTimer = setTimeout(() => {
          child.kill("SIGKILL");
        }, 2_000);
      }, this.timeoutMs);

      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf8");
      });

      child.on("error", (error) => {
        clearTimeout(timeout);
        if (hardKillTimer) clearTimeout(hardKillTimer);

        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          reject(
            new LibreOfficeConversionError(
              "NO_BINARY",
              `LibreOffice binary not found: ${this.binaryPath}`
            )
          );
          return;
        }

        reject(
          new LibreOfficeConversionError(
            "CONVERSION_FAILED",
            `Failed to start LibreOffice process: ${error.message}`
          )
        );
      });

      child.on("close", (code) => {
        clearTimeout(timeout);
        if (hardKillTimer) clearTimeout(hardKillTimer);

        if (timeoutTriggered) {
          reject(
            new LibreOfficeConversionError(
              "TIMEOUT",
              `LibreOffice conversion timed out after ${this.timeoutMs}ms.`
            )
          );
          return;
        }

        if (code !== 0) {
          const normalized = stderr.toLowerCase();
          const isLikelyInputIssue =
            normalized.includes("source file could not be loaded") ||
            normalized.includes("general input/output error") ||
            normalized.includes("password") ||
            normalized.includes("corrupt") ||
            normalized.includes("cannot be loaded");

          reject(
            new LibreOfficeConversionError(
              isLikelyInputIssue ? "UNPROCESSABLE" : "CONVERSION_FAILED",
              `LibreOffice conversion failed (exit ${code}). ${stderr.trim() || "No stderr output."}`
            )
          );
          return;
        }

        resolve(stderr);
      });
    });
  }

  private sanitizeInputFileName(value: string): string {
    /**
     * Sanitizes the input filename to prevent issues with special characters.
     * @param value - The original filename
     * @returns A safe filename with special characters removed or replaced
     */
    const base = value.trim().replace(/[\\/:*?"<>|]+/g, "_");
    if (!base) return "document.docx";
    return base;
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
