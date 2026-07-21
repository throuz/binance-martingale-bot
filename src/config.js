const BINANCE_URLS = {
  mainnet: {
    REST_BASEURL: "https://fapi.binance.com",
    WEBSOCKET_BASEURL: "wss://fstream.binance.com"
  },
  testnet: {
    REST_BASEURL: "https://testnet.binancefuture.com",
    WEBSOCKET_BASEURL: "wss://stream.binancefuture.com"
  }
};

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

const network = process.env.BINANCE_NETWORK;
const urls = BINANCE_URLS[network];

if (!urls) {
  throw new Error(
    `BINANCE_NETWORK must be "testnet" or "mainnet", received: ${network ?? "undefined"}`
  );
}

const env = {
  API_KEY: process.env.API_KEY,
  SECRET_KEY: process.env.SECRET_KEY,
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID,
  BINANCE_NETWORK: network,
  ...urls
};

const tradeConfig = {
  BASE_ASSET: "BTC",
  QUOTE_ASSET: "USDT",
  SYMBOL: "BTCUSDT",
  LEVERAGE: 125,
  FEE_RATE: 0.0004,
  TP_SL_RATE: 0.1,
  INITIAL_QUANTITY: 0.001
};

export { env, tradeConfig };
