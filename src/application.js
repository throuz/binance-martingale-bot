import { env, tradeConfig } from "./config.js";
import { createExchange } from "./exchange.js";
import { createNotifier } from "./notifier.js";
import { createBot } from "./bot.js";
import { createUserDataStream } from "./user-data-stream.js";
import { log, logError } from "./logger.js";

const run = () => {
  const exchange = createExchange(env, tradeConfig);
  const notifier = createNotifier(env, logError);
  const bot = createBot({ exchange, notifier, log, tradeConfig });
  let isExiting = false;

  const exitWithError = async (error) => {
    if (isExiting) return;
    isExiting = true;
    logError(error);
    await notifier.notify("Fatal error, process exited!");
    bot.stop();
    stream.stop();
    process.exit(1);
  };

  const stream = createUserDataStream({
    env,
    exchange,
    onEvent: bot.handleEvent,
    onReconnect: bot.reconcile,
    onFatal: exitWithError,
    log
  });

  const shutdown = (signal) => {
    if (isExiting) return;
    isExiting = true;
    log(`Received ${signal}, shutting down!`);
    bot.stop();
    stream.stop();
    process.exit(0);
  };

  process.on("unhandledRejection", exitWithError);
  process.on("uncaughtException", exitWithError);
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  stream.start().then(bot.start).catch(exitWithError);
};

export { run };
