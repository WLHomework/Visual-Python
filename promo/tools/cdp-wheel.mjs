const [xArg, yArg, deltaArg] = process.argv.slice(2);
const x = Number(xArg);
const y = Number(yArg);
const deltaY = Number(deltaArg);
if ([x, y, deltaY].some((value) => Number.isNaN(value))) {
  console.error("usage: node cdp-wheel.mjs <x> <y> <deltaY>");
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
await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
await send("Input.dispatchMouseEvent", {
  type: "mouseWheel",
  x,
  y,
  deltaX: 0,
  deltaY,
});
await new Promise((resolve) => setTimeout(resolve, 300));
console.log(`wheel ${deltaY} at ${x},${y}`);
ws.close();
