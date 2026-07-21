import { createHmac } from "node:crypto";
import env from "./env.js";

const REQUEST_TIMEOUT_MS = 10000;

class HttpError extends Error {
  constructor(message, { status, body, method, path }) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.body = body;
    this.method = method;
    this.path = path;
  }
}

const sign = (queryString) =>
  createHmac("sha256", env.SECRET_KEY).update(queryString).digest("hex");

const binanceRequest = async (
  method,
  path,
  params = {},
  { signed = false } = {}
) => {
  const searchParams = new URLSearchParams(params);
  if (signed) {
    searchParams.set("timestamp", Date.now().toString());
    searchParams.set("signature", sign(searchParams.toString()));
  }
  const query = searchParams.toString();
  const url = `${env.REST_BASEURL}${path}${query ? `?${query}` : ""}`;

  const response = await fetch(url, {
    method,
    headers: { "X-MBX-APIKEY": env.API_KEY },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });

  const body = await response.json().catch(() => undefined);
  if (!response.ok) {
    throw new HttpError(`Binance API ${response.status} on ${method} ${path}`, {
      status: response.status,
      body,
      method,
      path
    });
  }
  return body;
};

// Never include the request URL in thrown errors here: the bot token lives
// in the URL path, not a header, so it must not end up in any error log.
const sendTelegramMessage = async (text) => {
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
};

export { binanceRequest, sendTelegramMessage, HttpError };
