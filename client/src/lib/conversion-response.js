export async function conversionError(response) {
  const body = await response.json().catch(() => null);
  const messages = {
    401: "Your session expired. Log in again before converting.",
    502: "The conversion server became unavailable (HTTP 502). Wait a moment, then retry. If this keeps happening, try a smaller presentation or contact support.",
    503: "The conversion service is temporarily unavailable (HTTP 503). Wait a moment, then retry.",
    504: "The conversion server did not respond in time (HTTP 504). Try a smaller document or fewer slides.",
  };
  // Gateways often return HTML. Never expose their markup as a document error.
  const error = new Error(
    typeof body?.error === "string"
      ? body.error
      : messages[response.status] ||
          `Server conversion failed (HTTP ${response.status}).`,
  );
  error.status = response.status;
  return error;
}
