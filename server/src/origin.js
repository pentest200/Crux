// Local Vite fallback ports are trusted only in development, never production.
const developmentOrigins = new Set([
  "http://localhost:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
]);

export function isAllowedOrigin(settings, origin) {
  if (!origin) return false;
  return (
    origin === new URL(settings.CLIENT_ORIGIN).origin ||
    (settings.NODE_ENV === "development" && developmentOrigins.has(origin))
  );
}
