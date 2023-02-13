import axios from "axios";
import env from "./env.js";

const lineNotifyAPI = axios.create({
  baseURL: "https://notify-api.line.me",
  timeout: 1000,
  headers: {
    "Content-Type": "application/x-www-form-urlencoded",
    Authorization: `Bearer ${env.LINE_NOTIFY_TOKEN}`
  }
});

const binanceFuturesAPI = axios.create({
  baseURL: env.REST_BASEURL,
  timeout: 1000,
  headers: { "X-MBX-APIKEY": env.API_KEY }
});

export { lineNotifyAPI, binanceFuturesAPI };
