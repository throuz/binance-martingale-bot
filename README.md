# Binance Futures BOT

Binance Futures BOT is an automated trading robot specialized in Binance Futures trading.

## Basic Usage

Make sure the cross wallet has a certain amount of USDT (see `QUOTE_ASSET` in `src/trade-config.js`).

Install all dependencies.

```
npm i
```

Copy the example env files and fill in your own `API_KEY`, `SECRET_KEY` and `LINE_NOTIFY_TOKEN`. Both files are gitignored so your credentials never get committed.

```
cp src/env-dev.example.js src/env-dev.js
cp src/env-prod.example.js src/env-prod.js
```

`src/env.js` picks one of the two files based on `NODE_ENV` (see the `start:dev` / `start:prod` npm scripts):

```
import envDev from "./env-dev.js";
import envProd from "./env-prod.js";

const env = process.env.NODE_ENV === "production" ? envProd : envDev;

export default env;
```

## Strategy

This automatic trading strategy is improved based on the martingale strategy. Take profit / stop loss distance for each order is controlled by `TP_SL_RATE` in `src/trade-config.js` (plus a small buffer to cover leverage and trading fees). If the stop loss triggers, the next order is automatically placed at twice the quantity of the previous one; once the quantity would exceed the available funds, it resets back to the initial quantity.

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

Please make sure to update tests as appropriate.

## License

[MIT](https://choosealicense.com/licenses/mit/)
