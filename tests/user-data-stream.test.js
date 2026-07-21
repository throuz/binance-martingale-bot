import test from "node:test";
import assert from "node:assert/strict";
import { createUserDataStream } from "../src/user-data-stream.js";

class FakeWebSocket {
  static instances = [];

  constructor(url) {
    this.url = url;
    this.listeners = new Map();
    FakeWebSocket.instances.push(this);
  }

  addEventListener(name, listener) {
    this.listeners.set(name, listener);
  }

  emit(name, payload = {}) {
    this.listeners.get(name)?.(payload);
  }

  close() {
    this.emit("close");
  }
}

test("reconnect gets a fresh listen key and reconciles state", async (t) => {
  FakeWebSocket.instances = [];
  let listenKeyCount = 0;
  let reconnectCount = 0;
  const stream = createUserDataStream({
    env: { WEBSOCKET_BASEURL: "wss://example.test" },
    exchange: {
      createListenKey: async () => ({ listenKey: `key-${++listenKeyCount}` }),
      keepAliveListenKey: async () => {}
    },
    onEvent: async () => {},
    onReconnect: async () => {
      reconnectCount += 1;
    },
    onFatal: assert.fail,
    log: () => {},
    WebSocketClient: FakeWebSocket
  });
  t.after(stream.stop);

  await stream.start();
  FakeWebSocket.instances[0].emit("open");
  FakeWebSocket.instances[0].emit("close");
  await new Promise((resolve) => setImmediate(resolve));
  FakeWebSocket.instances[1].emit("open");

  assert.match(FakeWebSocket.instances[0].url, /key-1/);
  assert.match(FakeWebSocket.instances[1].url, /key-2/);
  assert.equal(reconnectCount, 1);
});

test("messages are processed sequentially", async (t) => {
  FakeWebSocket.instances = [];
  const received = [];
  let releaseFirst;
  const firstPending = new Promise((resolve) => {
    releaseFirst = resolve;
  });
  const stream = createUserDataStream({
    env: { WEBSOCKET_BASEURL: "wss://example.test" },
    exchange: {
      createListenKey: async () => ({ listenKey: "key" }),
      keepAliveListenKey: async () => {}
    },
    onEvent: async ({ id }) => {
      received.push(id);
      if (id === 1) await firstPending;
    },
    onReconnect: async () => {},
    onFatal: assert.fail,
    log: () => {},
    WebSocketClient: FakeWebSocket
  });
  t.after(stream.stop);
  await stream.start();

  const socket = FakeWebSocket.instances[0];
  socket.emit("message", { data: JSON.stringify({ id: 1 }) });
  socket.emit("message", { data: JSON.stringify({ id: 2 }) });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(received, [1]);
  releaseFirst();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(received, [1, 2]);
});
