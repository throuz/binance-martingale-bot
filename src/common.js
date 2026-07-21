import { lineNotifyAPI } from "./axios-instances.js";

const SENSITIVE_HEADER_KEYS = ["x-mbx-apikey", "authorization"];

const redactSensitiveHeaders = (headers = {}) => {
  const redacted = { ...headers };
  for (const key of Object.keys(redacted)) {
    if (SENSITIVE_HEADER_KEYS.includes(key.toLowerCase())) {
      redacted[key] = "[REDACTED]";
    }
  }
  return redacted;
};

const redactSignature = (url) =>
  url?.replace(/([?&]signature=)[^&]+/i, "$1[REDACTED]");

// error.config.url/headers can carry the Binance signature, API key or LINE
// token, so it must never be logged as-is.
const redactSensitiveConfig = (config) => {
  if (!config) {
    return config;
  }
  return {
    ...config,
    headers: redactSensitiveHeaders(config.headers),
    url: redactSignature(config.url)
  };
};

// error.request is axios's underlying Node request object (via follow-redirects),
// whose headers/path (and thus the API key / LINE token / signature) live
// either on the public API or its internal `_options`. Either way they must
// be redacted the same way before logging.
const summarizeRequest = (request) => {
  if (!request) {
    return request;
  }
  const options = request._options ?? {};
  const headers =
    (typeof request.getHeaders === "function" &&
    Object.keys(request.getHeaders()).length
      ? request.getHeaders()
      : options.headers) ?? {};
  return {
    method: request.method ?? options.method,
    host: request.getHeader?.("host") ?? options.hostname ?? options.host,
    path: redactSignature(request.path ?? options.path),
    headers: redactSensitiveHeaders(headers)
  };
};

const errorHandler = (error) => {
  if (error.response) {
    console.error(error.response.data);
    console.error(error.response.status);
    console.error(error.response.headers);
  } else if (error.request) {
    console.error(summarizeRequest(error.request));
  } else {
    console.error("Error", error.message);
  }
  console.error(redactSensitiveConfig(error.config));
};

const sendLineNotify = async (msg) => {
  try {
    await lineNotifyAPI.post("/api/notify", { message: `\n${msg}` });
  } catch (error) {
    errorHandler(error);
  }
};

const log = (msg) => {
  console.log(`${msg} [${new Date().toLocaleString()}]`);
};

const handleAPIError = async (error) => {
  errorHandler(error);
  await sendLineNotify("API error, process exited!");
  process.exit();
};

export { errorHandler, sendLineNotify, log, handleAPIError };
