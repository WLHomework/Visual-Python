const [x1, y1, x2, y2] = process.argv.slice(2).map(Number);
if ([x1, y1, x2, y2].some((value) => Number.isNaN(value))) {
  console.error("usage: node cdp-drag.mjs <x1> <y1> <x2> <y2>");
  process.exit(1);
}

const targets = await (await fetch("http://127.0.0.1:9222/json/list")).json();
const page = targets.find(
  (item) => item.type === "page" && !item.url.endsWith("/splash.html"),
);
if (!page) throw new Error("no page target");

const ws = new WebSocket(page.webSocketDebuggerUrl);
let nextId = 0;
const pending = new Map();
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    pending.get(message.id)(message);
    pending.delete(message.id);
  }
};
await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = reject;
});
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const id = ++nextId;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });

await send("Page.bringToFront");
await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: x1, y: y1 });
await send("Input.dispatchMouseEvent", {
  type: "mousePressed",
  x: x1,
  y: y1,
  button: "left",
  clickCount: 1,
});
for (let index = 1; index <= 12; index += 1) {
  const x = x1 + ((x2 - x1) * index) / 12;
  const y = y1 + ((y2 - y1) * index) / 12;
  await send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x,
    y,
    button: "left",
    buttons: 1,
  });
  await new Promise((resolve) => setTimeout(resolve, 25));
}
await send("Input.dispatchMouseEvent", {
  type: "mouseReleased",
  x: x2,
  y: y2,
  button: "left",
  clickCount: 1,
});
console.log(`dragged ${x1},${y1} -> ${x2},${y2}`);
ws.close();
