import { writeFileSync } from "node:fs";

const [output, widthArg, heightArg] = process.argv.slice(2);
if (!output) {
  console.error("usage: node cdp-shot.mjs <output.png> [width] [height]");
  process.exit(1);
}
const width = Number(widthArg ?? 1600);
const height = Number(heightArg ?? 1000);

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
await send("Emulation.setDeviceMetricsOverride", {
  width,
  height,
  deviceScaleFactor: 1,
  mobile: false,
});
await new Promise((resolve) => setTimeout(resolve, 250));
const shot = await send("Page.captureScreenshot", {
  format: "png",
  fromSurface: true,
  captureBeyondViewport: false,
});
if (!shot.result?.data) throw new Error(JSON.stringify(shot));
writeFileSync(output, Buffer.from(shot.result.data, "base64"));
console.log(`${output} ${width}x${height}`);
ws.close();

