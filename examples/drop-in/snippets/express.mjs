// One line in front of an Express app (Level 2). A company's door: it signs its own Shōkai host card with the place key,
// approved by a named person (SPEC §2.3). A person's door is set up with house.json and their passkey (`shokai init`).
import express from "express";
import { createDoor, shokaiDoor } from "@kigenka/shokai";

export const door = createDoor({
  name: "kettle", displayName: "Kettle & Leaf", category: "store", baseUrl: "https://kettle.example/shokai",
  purposes: [{ code: "visitation", statement: "Looking at our teas and asking about them." }],
  actions: [{ action: "tea.browse", purposes: ["visitation"], level: "discover" }],
  leaflet: { about: "Kettle & Leaf is a small tea shop. We sell loose-leaf tea by the gram.", hostName: "Suzu" },
  preset: "standard",
  approvedBy: { name: "Mika Tanabe", role: "Owner" },
});

export const app = express();
app.use(shokaiDoor(door));                       // the door, and /.well-known/shokai
app.get("/", (_req, res) => res.send("Kettle & Leaf"));   // your site, unchanged
