# Binance Futures Martingale Bot

A dependency-free Node.js bot for Binance USDⓈ-M Futures.

> [!WARNING]
> Starting the bot immediately opens a market position. Martingale sizing can
> rapidly increase losses. Test on Binance Futures Testnet first. Stopping the
> process does not close positions or cancel existing orders.

## Requirements

- Node.js 22 or newer
- Binance Futures API key with trading permission
- One-way position mode (`positionSide: BOTH`)
- Telegram bot token and chat ID

The configured `LEVERAGE` must match the leverage set in Binance. This bot uses
it for calculations but does not change the account leverage.

## Testnet Quick Start

```bash
cp .env.testnet.example .env.testnet
```

Fill in `.env.testnet`:

```dotenv
API_KEY=...
SECRET_KEY=...
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...
```

Then run:

```bash
npm test
npm run start:testnet
```

The `.env.testnet` and `.env.mainnet` files are ignored by Git. No `npm install`
is needed because the bot only uses Node.js built-ins.

To create Telegram credentials, create a bot with
[@BotFather](https://t.me/BotFather), message the bot, then read `chat.id` from
`https://api.telegram.org/bot<TOKEN>/getUpdates`.

## Mainnet

Only continue after verifying orders and notifications on Testnet:

```bash
cp .env.mainnet.example .env.mainnet
npm run start:mainnet
```

Use a restricted API key without withdrawal permission. Check the open position
and protective orders manually after startup, reconnection, or any error.

## Strategy

On startup, the bot:

1. Buys when the top-trader long/short position ratio is above `1`; otherwise,
   it sells.
2. Opens a market position.
3. Places `TAKE_PROFIT_MARKET` and `STOP_MARKET` conditional orders.
4. Doubles the next quantity after a stop loss.
5. Resets to the initial quantity after take profit or when the next quantity
   exceeds available funds.

The loss count is stored only in memory and resets whenever the process starts.
Trading parameters are in `src/config.js`:

```js
SYMBOL: "BTCUSDT"
LEVERAGE: 125
FEE_RATE: 0.0004
TP_SL_RATE: 0.1
INITIAL_QUANTITY: 0.001
```

## Project Structure

```text
app.js                    Entry point
src/application.js        Dependency wiring and process lifecycle
src/bot.js                Trading workflow and event handling
src/user-data-stream.js   Binance WebSocket lifecycle
src/exchange.js           Binance REST API client
src/notifier.js           Telegram notifications
src/strategy.js           Strategy and risk calculations
src/config.js             Network, credentials, and trading settings
tests/                    Unit tests with mocked API calls
```

## License

[MIT](LICENSE)
