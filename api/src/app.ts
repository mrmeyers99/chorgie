import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import { authRouter } from "./routes/auth.js";
import { householdRouter } from "./routes/household.js";
import { requireAuth } from "./middleware/auth.js";
import { adminRouter } from "./routes/admin.js";
import { kidsRouter } from "./routes/kids.js";
import { choresRouter } from "./routes/chores.js";
import { payoutsRouter } from "./routes/payouts.js";

export const app = express();

const trustProxySetting = process.env.TRUST_PROXY;
if (trustProxySetting) {
  const parsedTrustProxy =
    trustProxySetting === "true"
      ? true
      : /^\d+$/.test(trustProxySetting)
        ? Number(trustProxySetting)
        : trustProxySetting;
  app.set("trust proxy", parsedTrustProxy);
}

const corsOrigin = process.env.CORS_ORIGIN;
const allowedOrigins = corsOrigin
  ? corsOrigin.split(",").map((o) => o.trim())
  : [];
app.use(
  cors({
    origin: allowedOrigins.length
      ? (origin, callback) => {
          if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
          } else {
            callback(new Error("Not allowed by CORS"));
          }
        }
      : false,
    credentials: true,
  }),
);

app.use(express.json());
app.use(cookieParser());

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 200,
  standardHeaders: true,
  legacyHeaders: false,
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
});
// /auth/refresh isn't a credential-guessing surface like login/register, but every
// tab now calls it silently on load, so it needs a much larger budget of its own
// rather than sharing authLimiter's 30/15min bucket.
const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(apiLimiter);

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/auth/register", authLimiter);
app.use("/auth/login", authLimiter);
app.use("/auth/refresh", refreshLimiter);
app.use("/auth", authRouter);
app.use("/admin", adminLimiter, requireAuth, adminRouter);
app.use("/household", requireAuth, householdRouter);
app.use("/kids", requireAuth, kidsRouter);
app.use("/chores", requireAuth, choresRouter);
app.use("/payouts", requireAuth, payoutsRouter);
