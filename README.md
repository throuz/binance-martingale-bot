# Binance Futures Martingale Bot

A dependency-free Node.js bot for Binance USDⓈ-M Futures.

> [!WARNING]
> The bot can open a market position immediately. Martingale sizing can rapidly
> increase losses. Use Testnet first. Stopping the process does not close the
> position or cancel Binance orders.

The bot owns all regular and conditional orders for its configured `SYMBOL`.
Use a dedicated account or symbol; when the position is flat, unrelated open
orders for that symbol are canceled during reconciliation.

## Requirements

- Node.js 22 or newer
- Binance Futures API key with trading permission
- Telegram bot token and chat ID

## Testnet

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

Run:

```bash
npm test
npm run start:testnet
```

No `npm install` is needed. Secret `.env.testnet` and `.env.mainnet` files are
ignored by Git.

Create Telegram credentials with [@BotFather](https://t.me/BotFather), message
the bot, then read `chat.id` from
`https://api.telegram.org/bot<TOKEN>/getUpdates`.

## Mainnet

After verifying Testnet behavior:

```bash
cp .env.mainnet.example .env.mainnet
npm run start:mainnet
```

Use an IP-restricted API key without withdrawal permission.

## Automated Safety

At startup and after reconnection, the bot queries Binance and reconciles its
state. It:

- switches a flat account to One-way Mode;
- sets the configured leverage and margin type;
- reads Binance quantity, price, and minimum-order filters;
- reads the account's current taker fee;
- adopts an existing One-way position instead of opening another;
- restores missing take-profit or stop-loss protection;
- removes stale orders before opening a new position;
- serializes events to prevent overlapping order sets;
- uses stable client IDs to avoid duplicate conditional orders;
- attempts an emergency close if protection cannot be established; and
- reconciles every minute to repair state after missed WebSocket events.

An existing Hedge Mode position is rejected because it cannot be converted
safely. Always confirm the position and protective orders after any fatal error.

## Strategy

The bot buys when the top-trader long/short position ratio is above `1` and
sells otherwise. It opens a market position, then places
`TAKE_PROFIT_MARKET` and `STOP_MARKET` conditional orders.

After a stop loss, the next quantity doubles. It resets after take profit or
when the next quantity exceeds the estimated affordable quantity. On restart,
the loss count is inferred from an existing position quantity when it is an
exact martingale multiple; otherwise it starts from zero.

Edit trading settings in `src/config.js`:

```js
SYMBOL: "BTCUSDT"
LEVERAGE: 125
MARGIN_TYPE: "CROSSED"
FEE_RATE: 0.0004 // fallback if the fee query has no value
TP_SL_RATE: 0.1
INITIAL_QUANTITY: 0.001
```

## Structure

```text
app.js                    Entry point
src/application.js        Process lifecycle
src/bot.js                Martingale state and event routing
src/trader.js             Entries, protection, and emergency exits
src/reconciler.js         Account setup and state repair
src/user-data-stream.js   WebSocket lifecycle
src/exchange.js           Binance REST API
src/notifier.js           Telegram notifications
src/strategy.js           Pure calculations
src/config.js             Network and trading settings
tests/                    Mocked unit tests
```

## License

[MIT](LICENSE)
