# Binance Futures Martingale Bot

A dependency-free Node.js bot for Binance USDⓈ-M Futures. It trades one symbol
continuously, starting from a small quantity and doubling the next order after
each stop loss.

> [!WARNING]
> Starting the bot can open a market position immediately. Martingale losses
> grow exponentially. Use Testnet first. Stopping the process does not close a
> position or cancel its orders.

Use a dedicated account or symbol. The bot manages every position and order for
its configured `SYMBOL` and may cancel unrelated orders on that symbol.

## Strategy

For each trade, the bot:

1. buys when Binance's top-trader long/short position ratio is above `1`, and
   sells otherwise;
2. opens a market position;
3. places one take-profit and one stop-loss order; and
4. doubles the next quantity after a stop loss, or resets it after a take profit.

With `INITIAL_QUANTITY: 0.001`, quantities progress as follows:

```text
0.001 → 0.002 → 0.004 → 0.008 → ...
```

`INITIAL_QUANTITY` is a base quantity, not a fixed USDT cost or guaranteed
profit. It must satisfy the selected symbol's minimum quantity and step size.
The required margin changes with the price, leverage, and quantity.

`TP_SL_RATE` is the intended return on margin for one successful cycle before
funding, slippage, and rounding—not a price-change percentage. The bot converts
it to trigger prices using leverage and the current Binance taker fee. At later
martingale levels, it widens the triggers to approximately recover earlier
stop-losses and fees. Recovery is not guaranteed.

If the next doubled quantity is unaffordable, the sequence resets to the initial
quantity. This limits one sequence but does not prevent liquidation or total
loss, especially with Cross Margin and high leverage.

Edit trading settings in `src/config.js`:

```js
SYMBOL: "BTCUSDT"
LEVERAGE: 125
MARGIN_TYPE: "CROSSED"
FEE_RATE: 0.0004 // fallback when Binance does not return a taker fee
TP_SL_RATE: 0.1  // 10% intended return on margin
INITIAL_QUANTITY: 0.001
```

## Run on Testnet

Requirements: Node.js 22+, a Binance Futures API key, and Telegram credentials.

```bash
cp .env.testnet.example .env.testnet
```

Fill in `.env.testnet`, then run:

```bash
npm test
npm run start:testnet
```

No `npm install` is needed. Create Telegram credentials with
[@BotFather](https://t.me/BotFather), message the bot, then obtain `chat.id` from
`https://api.telegram.org/bot<TOKEN>/getUpdates`.

## Run on Mainnet

After validating Testnet behavior:

```bash
cp .env.mainnet.example .env.mainnet
npm run start:mainnet
```

Use an IP-restricted API key without withdrawal permission. Secret environment
files are ignored by Git.

## Automation and recovery

The bot uses Binance REST and user-data WebSocket APIs. It automatically:

- configures One-way Mode, leverage, and margin type when safe;
- reads the symbol's quantity and price rules and the account's taker fee;
- adopts an existing One-way position after restart;
- restores missing take-profit or stop-loss protection;
- removes stale orders before opening a new position;
- reconciles every minute and after WebSocket reconnection; and
- attempts an emergency close if protection cannot be established.

An open Hedge Mode position is rejected because it cannot be converted safely.
Always inspect Binance after a fatal error.

## Structure

```text
app.js                    Entry point
src/application.js        Process lifecycle
src/bot.js                State and event routing
src/trader.js             Entries, protection, and exits
src/reconciler.js         Account setup and state repair
src/user-data-stream.js   WebSocket lifecycle
src/exchange.js           Binance REST API
src/notifier.js           Telegram notifications
src/strategy.js           Pure calculations
src/config.js             Network and trading settings
tests/                    Unit tests
```

## License

[MIT](LICENSE)
