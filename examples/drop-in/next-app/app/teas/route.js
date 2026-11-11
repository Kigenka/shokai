// The site's own API route (not the door's): the teas on offer.
export const GET = () => Response.json([{ name: "sencha", per_100g: "12.00 USD" }, { name: "genmaicha", per_100g: "9.00 USD" }]);
