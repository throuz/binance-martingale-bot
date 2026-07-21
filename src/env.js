// REST_BASEURL/WEBSOCKET_BASEURL only ever take one of these two fixed
// pairs, so they're derived from NODE_ENV instead of being duplicated (and
// potentially mismatched/mistyped) across .env files.
const BINANCE_URLS = {
  production: {
    REST_BASEURL: "https://fapi.binance.com",
    WEBSOCKET_BASEURL: "wss://fstream.binance.com"
  },
  development: {
    REST_BASEURL: "https://testnet.binancefuture.com",
    WEBSOCKET_BASEURL: "wss://stream.binancefuture.com"
  }
};

const { REST_BASEURL, WEBSOCKET_BASEURL } =
  BINANCE_URLS[process.env.NODE_ENV] ?? BINANCE_URLS.development;

const REQUIRED_ENV_VARS = [
  "API_KEY",
  "SECRET_KEY",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_CHAT_ID"
];

for (const key of REQUIRED_ENV_VARS) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

export default {
  API_KEY: process.env.API_KEY,
  SECRET_KEY: process.env.SECRET_KEY,
  REST_BASEURL,
  WEBSOCKET_BASEURL,
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID
};
