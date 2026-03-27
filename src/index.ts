import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { validateApiKey } from "./middleware/auth.middleware";
import authRoutes from "./routes/auth.routes";
import signingRoutes from "./routes/signing.routes";
import guestRoutes from "./routes/guest.routes";
import { initFirebase } from "./services/firebase.service";
import storageRoutes from "./routes/storage.routes";

const app = express();
const PORT = process.env.PORT ?? 3000;

initFirebase();

const getAllowedOrigins = () => {
  const configured = (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  if (configured.length === 0) {
    throw new Error(
      "ALLOWED_ORIGINS is required. Set one or more comma-separated origins.",
    );
  }

  return configured;
};

const allowedOrigins = getAllowedOrigins();

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // Log the incoming origin for debugging
    console.log(
      `[CORS Request] Origin: ${origin || "No Origin (likely local/mobile)"}`,
    );
    console.log(`[CORS Check] Allowed List: ${allowedOrigins.join(", ")}`);

    if (
      !origin ||
      allowedOrigins.includes(origin) ||
      allowedOrigins.includes("*")
    ) {
      callback(null, true);
    } else {
      console.warn(`[CORS Blocked] Origin "${origin}" not in allowed list.`);
      callback(null, false); // Block without throwing to keep preflight headers visible
    }
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "x-api-key", "Authorization"],
  credentials: true,
};

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(helmet());
app.set("trust proxy", 1);

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));

app.use(express.json());

// ─── Health check (no auth required) ─────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ─── Public Guest Routes (No API Key) ───────────────────────────────────────
app.use("/api/v1/guest", guestRoutes);
app.use("/api/storage", storageRoutes);

// ─── API routes (all require x-api-key header) ───────────────────────────────
app.use("/api", validateApiKey);
app.use("/api/auth", authRoutes);
app.use("/api/signing", signingRoutes);

// ─── 404 handler ─────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ success: false, message: "Route not found" });
});

// ─── Start server ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📍 Environment: ${process.env.NODE_ENV ?? "development"}`);
});

export default app;
