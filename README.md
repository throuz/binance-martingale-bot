# Binance Futures BOT

Binance Futures BOT is an automated trading robot specialized in Binance Futures trading.

## Basic Usage

Make sure the cross wallet has a certain amount of USDT (see `QUOTE_ASSET` in `src/config.js`).

This bot has zero npm dependencies — it only uses Node's built-in `fetch` and `WebSocket` (both require **Node 22+**), so `npm i` has nothing to install.

Copy the example env files and fill in your own values. Both files are gitignored so your credentials never get committed.

```
cp .env.testnet.example .env.testnet
cp .env.mainnet.example .env.mainnet
```

Each file needs:

```
API_KEY=...
SECRET_KEY=...
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...
```

(`REST_BASEURL`/`WEBSOCKET_BASEURL` aren't in the env files — they only ever take one of two fixed values, so `src/config.js` picks the right pair automatically based on `BINANCE_NETWORK`, which the npm scripts already set.)

Run the strategy and risk-control tests with:

```
npm test
```

## Project Structure

```
app.js                    # Minimal process entry point
src/application.js        # Dependency wiring and process lifecycle
src/bot.js                # Trading workflow and user-data event handling
src/user-data-stream.js   # Binance WebSocket lifecycle
src/exchange.js           # Binance REST API client
src/notifier.js           # Telegram notifications
src/strategy.js           # Pure strategy and risk calculations
src/config.js             # Network, credentials, and trading configuration
```

`API_KEY` / `SECRET_KEY` come from your Binance Futures API key (use a [Testnet](https://testnet.binancefuture.com) key for `.env.testnet`). To get the Telegram values:

1. Message [@BotFather](https://t.me/BotFather) on Telegram, run `/newbot`, and copy the token it gives you into `TELEGRAM_BOT_TOKEN`.
2. Send your new bot any message, then open `https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getUpdates` in a browser and copy the `chat.id` value into `TELEGRAM_CHAT_ID`.

The npm scripts load the right file automatically via Node's built-in `--env-file` flag — no extra config-loading code needed:

```
"start:testnet": "TZ=Asia/Taipei BINANCE_NETWORK=testnet node --env-file=.env.testnet app",
"start:mainnet": "TZ=Asia/Taipei BINANCE_NETWORK=mainnet node --env-file=.env.mainnet app"
```

## Strategy

This automatic trading strategy is improved based on the martingale strategy. Take profit / stop loss distance for each order is controlled by `TP_SL_RATE` in `src/config.js` (plus a small buffer to cover leverage and trading fees). If the stop loss triggers, the next order is automatically placed at twice the quantity of the previous one; once the quantity would exceed the available funds, it resets back to the initial quantity.

Take profit / stop loss orders are placed as conditional (algo) orders via `POST /fapi/v1/algoOrder`, per Binance's migration of `STOP_MARKET` / `TAKE_PROFIT_MARKET` off the regular order endpoint (effective 2025-12-09). **Strongly recommended: run against Testnet first** (`.env.testnet`) and confirm orders/notifications behave as expected before pointing this at a live account — Binance has changed several parts of the Futures API this bot depends on recently, and this hasn't been battle-tested against a live order book. In particular, connection-loss detection relies on any inbound user-data message resetting a 5-minute watchdog rather than raw WebSocket ping frames (Node's native `WebSocket` doesn't expose those) — during a genuinely quiet account this may reconnect somewhat more eagerly than strictly necessary, which is expected.

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

Please make sure to update tests as appropriate.

## License

[MIT](https://choosealicense.com/licenses/mit/)
