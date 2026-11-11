// A sample node:http site for a fictional tea shop (Kettle & Leaf). `node server.mjs` listens on PORT (default 3000), 127.0.0.1 only.
import { createServer } from "node:http";

const server = createServer(async (req, res) => {
  const path = new URL(req.url ?? "/", "http://x").pathname;
  if (path === "/") { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); return res.end(`<!doctype html><html><head><title>Kettle &amp; Leaf</title></head><body><h1>Kettle &amp; Leaf</h1><p>Loose-leaf tea by the gram.</p></body></html>`); }
  if (path === "/teas") { res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify([{ name: "sencha", per_100g: "12.00 USD" }, { name: "genmaicha", per_100g: "9.00 USD" }])); }
  res.writeHead(404, { "content-type": "text/plain" }); res.end("Not found");
});

export default server;
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  const port = Number(process.env.PORT ?? 3000);
  server.listen(port, "127.0.0.1", () => console.log(`listening on http://127.0.0.1:${port}`));
}
