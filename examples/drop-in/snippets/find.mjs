// A visiting representative that only knows a site's address finds its door (Level 1 sites publish /.well-known/shokai,
// or <link rel="shokai" href="/.well-known/shokai"> in their pages).
import { discover, doorBase, findPlace } from "@kigenka/shokai";

export async function placeAt(site, o = {}) {
  const found = await discover(site, o);           // { pointer, via: "well-known" | "link" } or null
  return found ? findPlace(doorBase(found.pointer)) : null;
}
