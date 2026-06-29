import rateLimit from "express-rate-limit";

export const publicWriteLimiter = rateLimit({
  legacyHeaders: false,
  max: 20,
  message: { message: "Demasiadas solicitudes, intenta mas tarde" },
  standardHeaders: true,
  windowMs: 15 * 60 * 1000
});

export const publicReadLimiter = rateLimit({
  legacyHeaders: false,
  max: 60,
  message: { message: "Demasiadas solicitudes, intenta mas tarde" },
  standardHeaders: true,
  windowMs: 60 * 1000
});
