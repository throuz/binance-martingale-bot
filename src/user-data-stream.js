const LISTEN_KEY_KEEPALIVE_INTERVAL_MS = 3540000;
const SOCKET_WATCHDOG_TIMEOUT_MS = 301000;
const EVENTS = "ORDER_TRADE_UPDATE/ACCOUNT_UPDATE/ALGO_UPDATE";

const createUserDataStream = ({
  env,
  exchange,
  onEvent,
  onReconnect,
  onFatal,
  log,
  WebSocketClient = WebSocket
}) => {
  let socket;
  let watchdogTimeout;
  let keepAliveInterval;
  let isStopping = false;
  let hasConnected = false;
  let eventQueue = Promise.resolve();

  const resetWatchdog = () => {
    clearTimeout(watchdogTimeout);
    watchdogTimeout = setTimeout(() => socket?.close(), SOCKET_WATCHDOG_TIMEOUT_MS);
  };

  const connect = async () => {
    const { listenKey } = await exchange.createListenKey();
    socket = new WebSocketClient(
      `${env.WEBSOCKET_BASEURL}/private/ws?listenKey=${listenKey}&events=${EVENTS}`
    );

    socket.addEventListener("open", () => {
      log("Socket open!");
      resetWatchdog();
      if (hasConnected) onReconnect().catch(onFatal);
      hasConnected = true;
    });

    socket.addEventListener("message", (event) => {
      resetWatchdog();
      let payload;
      try {
        payload = JSON.parse(event.data);
      } catch (error) {
        onFatal(error);
        return;
      }
      if (payload.e === "listenKeyExpired") {
        socket.close();
        return;
      }
      // Serialize events so two fills cannot place overlapping order sets.
      eventQueue = eventQueue
        .then(() => onEvent(payload))
        .catch(onFatal);
    });

    socket.addEventListener("close", () => {
      log("Socket close!");
      if (!isStopping) connect().catch(onFatal);
    });

    socket.addEventListener("error", (event) => {
      log("Socket error!");
      console.error(event.message ?? event);
      socket.close();
    });
  };

  const start = async () => {
    keepAliveInterval = setInterval(() => {
      exchange.keepAliveListenKey().catch(onFatal);
    }, LISTEN_KEY_KEEPALIVE_INTERVAL_MS);
    await connect();
  };

  const stop = () => {
    isStopping = true;
    clearInterval(keepAliveInterval);
    clearTimeout(watchdogTimeout);
    socket?.close();
  };

  return { start, stop };
};

export { createUserDataStream };
