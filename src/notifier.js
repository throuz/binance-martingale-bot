import { HttpError } from "./http-error.js";

const REQUEST_TIMEOUT_MS = 10000;

const createNotifier = (env, logError) => ({
  notify: async (text) => {
    try {
      const response = await fetch(
        `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
        }
      );
      if (!response.ok) {
        const body = await response.json().catch(() => undefined);
        throw new HttpError(`Telegram sendMessage ${response.status}`, {
          status: response.status,
          body,
          method: "POST",
          path: "/sendMessage"
        });
      }
    } catch (error) {
      // A notification failure must not interrupt trading or error handling.
      logError(error);
    }
  }
});

export { createNotifier };
