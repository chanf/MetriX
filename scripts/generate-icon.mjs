import { Resvg } from "@resvg/resvg-js";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const svg = readFileSync(new URL("./metrix-icon.svg", import.meta.url));
const resvg = new Resvg(svg, { fitTo: { mode: "width", value: 1024 } });
const png = resvg.render().asPng();
mkdirSync("build", { recursive: true });
writeFileSync("build/metrix-icon-1024.png", png);
console.log("build/metrix-icon-1024.png written", png.length, "bytes");
