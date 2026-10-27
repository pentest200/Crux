const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function authRequest(path, body, retries = 2) {
  // A lost signup response may already have created an account. Never replay POSTs.
  if (body !== undefined) retries = 0;
  let attempt = 0;
  while (true) {
    try {
      const response = await fetch(`/api/auth/${path}`, {
        method: body === undefined ? "GET" : "POST",
        credentials: "same-origin",
        cache: "no-store",
        ...(body === undefined
          ? {}
          : {
              headers: {
                "Content-Type": "application/json",
                "x-ghost-auth": "1",
              },
              body: JSON.stringify(body),
            }),
      });
      if (response.status === 204) return null;

      // Auto-retry on Render cold-start gateway errors
      if ([502, 503, 504].includes(response.status) && attempt < retries) {
        attempt++;
        await wait(1200 * attempt);
        continue;
      }

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(
          data.error || "Account service is unavailable. Please try again.",
        );
        error.status = response.status;
        throw error;
      }
      return data;
    } catch (err) {
      if (
        attempt < retries &&
        (err.status === 502 || err.name === "TypeError")
      ) {
        attempt++;
        await wait(1200 * attempt);
        continue;
      }
      throw err;
    }
  }
}
