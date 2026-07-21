const REQUIRED_ENV_VARS = [
  "API_KEY",
  "SECRET_KEY",
  "REST_BASEURL",
  "WEBSOCKET_BASEURL",
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
  REST_BASEURL: process.env.REST_BASEURL,
  WEBSOCKET_BASEURL: process.env.WEBSOCKET_BASEURL,
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID
};
