import axios from "axios";
import env from "./env.js";

const { LINE_NOTIFY_TOKEN, REST_BASEURL, API_KEY } = env;

const REQUEST_TIMEOUT_MS = 10000;

const lineNotifyAPI = axios.create({
  baseURL: "https://notify-api.line.me",
  timeout: REQUEST_TIMEOUT_MS,
  headers: {
    "Content-Type": "application/x-www-form-urlencoded",
    Authorization: `Bearer ${LINE_NOTIFY_TOKEN}`
  }
});

const binanceFuturesAPI = axios.create({
  baseURL: REST_BASEURL,
  timeout: REQUEST_TIMEOUT_MS,
  headers: { "X-MBX-APIKEY": API_KEY }
});

export { lineNotifyAPI, binanceFuturesAPI };
