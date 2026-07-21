const log = (message) => {
  const timestamp = new Date().toLocaleString("zh-TW", {
    timeZone: "Asia/Taipei"
  });
  console.log(`${message} [${timestamp}]`);
};

const logError = (error) => {
  if (error.name === "HttpError") {
    console.error(`${error.method} ${error.path} -> ${error.status}`);
    console.error(error.body);
  } else if (error.name === "TimeoutError" || error.name === "AbortError") {
    console.error(`Request timed out: ${error.message}`);
  } else {
    console.error(error);
  }
};

export { log, logError };
