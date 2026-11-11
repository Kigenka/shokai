// A sample Express site for a fictional tea shop (Kettle & Leaf). `node server.mjs` listens on PORT (default 3000), 127.0.0.1 only.
import express from "express";

const app = express();
app.use(express.json());

app.get("/", (_req, res) => {
  res.type("html").send(`<!doctype html><html><head><title>Kettle &amp; Leaf</title></head><body><h1>Kettle &amp; Leaf</h1><p>Loose-leaf tea by the gram.</p></body></html>`);
});
app.get("/teas", (_req, res) => res.json([{ name: "sencha", per_100g: "12.00 USD" }, { name: "genmaicha", per_100g: "9.00 USD" }]));

export default app;
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  const port = Number(process.env.PORT ?? 3000);
  app.listen(port, "127.0.0.1", () => console.log(`listening on http://127.0.0.1:${port}`));
}
