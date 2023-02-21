import querystring from "node:querystring";
import { taAPI } from "./src/axios-instances.js";
import { handleAPIError } from "./src/common";

const getRSI = async () => {
  try {
    const totalParams = {
      exchange: "binance",
      symbol: "BTC/USDT",
      interval: "1h"
    };
    const queryString = querystring.stringify(totalParams);

    const response = await taAPI.get(`/rsi?${queryString}`);
    console.log(response.data);
  } catch (error) {
    await handleAPIError(error);
  }
};

getRSI();

setInterval(getRSI, 20000);
