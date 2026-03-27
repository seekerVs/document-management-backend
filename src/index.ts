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

// src/index.ts

const app = express();
const PORT = process.env.PORT ?? 3000;

initFirebase();

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use("/api/storage", storageRoutes);
app.use(helmet());
app.set("trust proxy", 1);

app.use(
  cors({
    origin: (origin, callback) => {
      const allowed = (process.env.ALLOWED_ORIGINS ?? "")
        .split(",")
        .map((o) => o.trim());

      // Allow requests with no origin (e.g. mobile apps, Postman)
      if (!origin || allowed.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: Origin ${origin} not allowed`));
      }
    },
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "x-api-key"],
  }),
);

app.use(express.json());

// ─── Health check (no auth required) ─────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ─── Public Guest Routes (No API Key) ───────────────────────────────────────
app.use("/api/v1/guest", guestRoutes);

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
