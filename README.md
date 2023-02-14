# Binance Futures BOT

Binance Futures BOT is an automated trading robot specialized in Binance Futures trading.

## Basic Usage

Make sure the cross wallet has a certain amount of BUSD.

Install all dependencies.

```
npm i
```

Create `src/env.js`, the content is as follows, replace `API_KEY` and `SECRET_KEY` with your own.

```
const envProd = {
    API_KEY: "your_api_key",
    SECRET_KEY: "your_secret_key",
    REST_BASEURL: "https://fapi.binance.com",
    WEBSOCKET_BASEURL: "wss://fstream.binance.com",
    LINE_NOTIFY_TOKEN: "your_line_notify_token"
};

const envDev = {
    API_KEY: "your_api_key",
    SECRET_KEY: "your_secret_key",
    REST_BASEURL: "https://testnet.binancefuture.com",
    WEBSOCKET_BASEURL: "wss://stream.binancefuture.com",
    LINE_NOTIFY_TOKEN: "your_line_notify_token"
};

const env = process.env.NODE_ENV === "production" ? envProd : envDev;

export default env;
```

## Strategy

This automatic trading strategy is improved based on the martingale strategy, take profit and stop loss of each order is 20%. If the stop loss, it will be automatically placed twice the quantity of the previous order, if the quantity exceeds the total funds, the initial quantity will be placed.

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

Please make sure to update tests as appropriate.

## License

[MIT](https://choosealicense.com/licenses/mit/)
