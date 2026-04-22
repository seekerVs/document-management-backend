import "dotenv/config";

const parseCsv = (value: string | undefined): string[] => {
  let raw = value ?? "";
  // Robustness: strip accidental key prefix if it exists in the value
  if (raw.startsWith("ALLOWED_ORIGINS=")) {
    raw = raw.replace("ALLOWED_ORIGINS=", "");
  }
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
};

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
  libreOfficeTimeoutMs: toNumber(process.env.LIBREOFFICE_TIMEOUT_MS, 45_000),
  libreOfficeMaxConcurrency: Math.max(
    1,
    toNumber(process.env.LIBREOFFICE_MAX_CONCURRENCY, 2)
  ),
  signingBaseUrl: process.env.SIGNING_BASE_URL ?? "https://your-web-app.com",
  supabaseUrl: process.env.SUPABASE_URL ?? "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  gotenbergUrl: process.env.GOTENBERG_URL ?? "http://localhost:3000",
} as const;
