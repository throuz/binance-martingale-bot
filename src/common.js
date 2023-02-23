import { lineNotifyAPI } from "./axios-instances.js";

const errorHandler = (error) => {
  if (error.response) {
    console.log(error.response.data);
    console.log(error.response.status);
    console.log(error.response.headers);
  } else if (error.request) {
    console.log(error.request);
  } else {
    console.log("Error", error.message);
  }
  console.log(error.config);
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
