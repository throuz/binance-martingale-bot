# Binance Futures BOT

Binance Futures BOT is an automated trading robot specialized in Binance Futures trading.

## Basic Usage

Make sure the cross wallet has a certain amount of USDT (see `QUOTE_ASSET` in `src/trade-config.js`).

Install dependencies (only [`ws`](https://github.com/websockets/ws) — everything else uses Node's built-in `fetch`).

```
npm i
```

Copy the example env files and fill in your own values. Both files are gitignored so your credentials never get committed.

```
cp .env.development.example .env.development
cp .env.production.example .env.production
```

Each file needs:

```
API_KEY=...
SECRET_KEY=...
REST_BASEURL=...
WEBSOCKET_BASEURL=...
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...
```

`API_KEY` / `SECRET_KEY` come from your Binance Futures API key (use a [Testnet](https://testnet.binancefuture.com) key for `.env.development`). To get the Telegram values:

1. Message [@BotFather](https://t.me/BotFather) on Telegram, run `/newbot`, and copy the token it gives you into `TELEGRAM_BOT_TOKEN`.
2. Send your new bot any message, then open `https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getUpdates` in a browser and copy the `chat.id` value into `TELEGRAM_CHAT_ID`.

The npm scripts load the right file automatically via Node's built-in `--env-file` flag — no extra config-loading code needed:

```
"start:dev": "TZ=Asia/Taipei NODE_ENV=development node --env-file=.env.development app",
"start:prod": "TZ=Asia/Taipei NODE_ENV=production node --env-file=.env.production app"
```

## Strategy

This automatic trading strategy is improved based on the martingale strategy. Take profit / stop loss distance for each order is controlled by `TP_SL_RATE` in `src/trade-config.js` (plus a small buffer to cover leverage and trading fees). If the stop loss triggers, the next order is automatically placed at twice the quantity of the previous one; once the quantity would exceed the available funds, it resets back to the initial quantity.

Take profit / stop loss orders are placed as conditional (algo) orders via `POST /fapi/v1/algoOrder`, per Binance's migration of `STOP_MARKET` / `TAKE_PROFIT_MARKET` off the regular order endpoint (effective 2025-12-09). **Strongly recommended: run against Testnet first** (`.env.development`) and confirm orders/notifications behave as expected before pointing this at a live account — Binance has changed several parts of the Futures API this bot depends on recently, and this hasn't been battle-tested against a live order book.

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

Please make sure to update tests as appropriate.

## License

[MIT](https://choosealicense.com/licenses/mit/)
