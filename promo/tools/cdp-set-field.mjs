const [xArg, yArg, text] = process.argv.slice(2);
if (!xArg || !yArg || text === undefined) {
  console.error("usage: node cdp-set-field.mjs <x> <y> <text>");
  process.exit(1);
}
const x = Number(xArg);
const y = Number(yArg);

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
await new Promise((resolve) => setTimeout(resolve, 350));

await send("Input.dispatchKeyEvent", {
  type: "keyDown",
  key: "a",
  code: "KeyA",
  windowsVirtualKeyCode: 65,
  modifiers: 2,
});
await send("Input.dispatchKeyEvent", {
  type: "keyUp",
  key: "a",
  code: "KeyA",
  windowsVirtualKeyCode: 65,
  modifiers: 2,
});
await send("Input.insertText", { text });
await send("Input.dispatchKeyEvent", {
  type: "keyDown",
  key: "Enter",
  code: "Enter",
  windowsVirtualKeyCode: 13,
});
await send("Input.dispatchKeyEvent", {
  type: "keyUp",
  key: "Enter",
  code: "Enter",
  windowsVirtualKeyCode: 13,
});
await new Promise((resolve) => setTimeout(resolve, 600));
console.log(`field ${x},${y} -> ${text}`);
ws.close();
