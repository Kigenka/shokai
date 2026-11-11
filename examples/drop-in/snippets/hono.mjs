// Hono, Bun, Deno or Workers: the door is a fetch handler.
import { Hono } from "hono";
import { door } from "./express.mjs";             // the same createDoor(...) as above

export const app = new Hono();
app.all("/shokai/*", (c) => door.fetch(c.req.raw));
app.get("/.well-known/shokai", (c) => door.fetch(c.req.raw));
app.get("/", (c) => c.text("Kettle & Leaf"));
