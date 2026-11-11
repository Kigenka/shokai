// Next.js App Router: app/shokai/[[...path]]/route.js (and public/.well-known/shokai, which `shokai init` writes).
import { nextDoor } from "@kigenka/shokai";
import { door } from "./express.mjs";             // the same createDoor(...) as above

export const { GET, POST, HEAD } = nextDoor(door);
