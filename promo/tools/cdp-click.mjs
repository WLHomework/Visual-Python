const [xArg, yArg] = process.argv.slice(2);
if (xArg === undefined || yArg === undefined) {
  console.error("usage: node cdp-click.mjs <x> <y>");
  process.exit(1);
}
const x = Number(xArg);
const y = Number(yArg);

const targets = await (await fetch("http://127.0.0.1:9222/json/list")).json();
const page = targets.find((item) => item.type === "page" && !item.url.endsWith("/splash.html")) ?? targets.find((item) => item.type === "page");
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
  type: "mousePressed",
  x,
  y,
  button: "left",
  clickCount: 1,
});
await send("Input.dispatchMouseEvent", {
  type: "mouseReleased",
  x,
  y,
  button: "left",
  clickCount: 1,
});
await new Promise((resolve) => setTimeout(resolve, 500));
console.log(`clicked ${x},${y}`);
ws.close();

