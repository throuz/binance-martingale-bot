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

export { sendLineNotify, log };
