import express from "express";
import cors from "cors";
import helmet from "helmet";
import { validateApiKey } from "./middleware/auth.middleware.js";
import authRoutes from "./routes/auth.routes.js";
import signingRoutes from "./routes/signing.routes.js";
import guestRoutes from "./routes/guest.routes.js";
import { initFirebase } from "./services/firebase.service.js";
import storageRoutes from "./routes/storage.routes.js";
import documentsRoutes from "./routes/documents.routes.js";
import { onRequest } from "firebase-functions/v2/https";
import { environment } from "./config/environment.js";

const app = express();

initFirebase();

const allowedOrigins = environment.allowedOrigins;

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // Log the incoming origin for debugging
    console.log(
      `[CORS Request] Origin: ${origin || "No Origin (likely local/mobile)"}`
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

// Middleware
app.use(helmet());
app.set("trust proxy", 1);

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));

app.use(express.json());

// Health check (no auth required)
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Public Guest Routes (No API Key)
app.use("/api/v1/guest", guestRoutes);
app.use("/api/storage", storageRoutes);

// API routes (all require x-api-key header)
app.use("/api", validateApiKey);
app.use("/api/auth", authRoutes);
app.use("/api/signing", signingRoutes);
app.use("/api/documents", documentsRoutes);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ success: false, message: "Route not found" });
});

// Start the server only when not in a Firebase Function environment
if (!process.env.FUNCTION_TARGET) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });
}

export const api = onRequest(app);
