import { lineNotifyAPI } from "./axios-instances.js";

const sendLineNotify = async (msg) => {
  try {
    await lineNotifyAPI.post("/api/notify", { message: `\n${msg}` });
  } catch (error) {
    console.error(error.toJSON());
  }
};

const log = (msg) => {
  console.log(`${msg} [${new Date().toLocaleString()}]`);
};

const handleBinanceFuturesAPIError = async (error) => {
  console.error(error.toJSON());
  await sendLineNotify("API error, process exited!");
  process.exit();
};

export { sendLineNotify, log, handleBinanceFuturesAPIError };
