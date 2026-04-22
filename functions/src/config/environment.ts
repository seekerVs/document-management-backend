import "dotenv/config";
import os from "node:os";
import path from "node:path";

const parseCsv = (value: string | undefined): string[] =>
  (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const toNumber = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const environment = {
  allowedOrigins: parseCsv(process.env.ALLOWED_ORIGINS),
  apiSecretKey: process.env.API_SECRET_KEY ?? "",
  brevoApiKey: process.env.BREVO_API_KEY ?? "",
  emailFromName: process.env.EMAIL_FROM_NAME ?? "Scrivener",
  emailFromAddress: process.env.EMAIL_FROM_ADDRESS ?? "",
  libreOfficeBinaryPath:
    process.env.LIBREOFFICE_BIN_PATH ??
    (process.platform === "win32" ? "soffice" : "libreoffice"),
  libreOfficeTimeoutMs: toNumber(process.env.LIBREOFFICE_TIMEOUT_MS, 45_000),
  libreOfficeTempDir:
    process.env.TEMP_FILE_DIR ?? path.join(os.tmpdir(), "dms-conversions"),
  libreOfficeMaxConcurrency: Math.max(
    1,
    toNumber(process.env.LIBREOFFICE_MAX_CONCURRENCY, 2)
  ),
  signingBaseUrl: process.env.SIGNING_BASE_URL ?? "https://your-web-app.com",
  supabaseUrl: process.env.SUPABASE_URL ?? "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
} as const;
