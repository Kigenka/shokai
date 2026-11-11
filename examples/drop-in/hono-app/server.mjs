// A sample Hono site for a fictional tea shop (Kettle & Leaf). `node server.mjs` listens on PORT (default 3000), 127.0.0.1 only.
import { Hono } from "hono";
import { serve } from "@hono/node-server";

const app = new Hono();

app.get("/", (c) => c.html(`<!doctype html><html><head><title>Kettle &amp; Leaf</title></head><body><h1>Kettle &amp; Leaf</h1><p>Loose-leaf tea by the gram.</p></body></html>`));
app.get("/teas", (c) => c.json([{ name: "sencha", per_100g: "12.00 USD" }, { name: "genmaicha", per_100g: "9.00 USD" }]));

export default app;
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  const port = Number(process.env.PORT ?? 3000);
  serve({ fetch: app.fetch, port, hostname: "127.0.0.1" }, () => console.log(`listening on http://127.0.0.1:${port}`));
}
