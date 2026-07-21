import { sendTelegramMessage } from "./api-clients.js";

const errorHandler = (error) => {
  if (error.name === "HttpError") {
    console.error(`${error.method} ${error.path} -> ${error.status}`);
    console.error(error.body);
  } else if (error.name === "TimeoutError" || error.name === "AbortError") {
    console.error(`Request timed out: ${error.message}`);
  } else {
    console.error(error);
  }
};

const sendTelegramNotify = async (msg) => {
  try {
    await sendTelegramMessage(msg);
  } catch (error) {
    errorHandler(error);
  }
};

const log = (msg) => {
  console.log(`${msg} [${new Date().toLocaleString()}]`);
};

const handleAPIError = async (error) => {
  errorHandler(error);
  await sendTelegramNotify("API error, process exited!");
  process.exit();
};

export { errorHandler, sendTelegramNotify, log, handleAPIError };
