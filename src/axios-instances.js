import axios from "axios";
import env from "./env.js";

const { LINE_NOTIFY_TOKEN, REST_BASEURL, API_KEY, TAAPI_API_KEY } = env;

const lineNotifyAPI = axios.create({
  baseURL: "https://notify-api.line.me",
  headers: {
    "Content-Type": "application/x-www-form-urlencoded",
    Authorization: `Bearer ${LINE_NOTIFY_TOKEN}`
  }
});

const binanceFuturesAPI = axios.create({
  baseURL: REST_BASEURL,
  headers: { "X-MBX-APIKEY": API_KEY }
});

const taAPI = axios.create({
  baseURL: "https://api.taapi.io",
  params: {
    secret: TAAPI_API_KEY
  }
});

export { lineNotifyAPI, binanceFuturesAPI, taAPI };
