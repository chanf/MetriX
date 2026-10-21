// 生成菜单栏托盘图标（template 模式：仅用 alpha 通道，系统自动适配深浅色）
// 用法：node scripts/generate-tray-icon.mjs
import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <g fill="none" stroke="#ffffff" stroke-linecap="round">
    <circle cx="512" cy="512" r="352" stroke-width="72"
            stroke-dasharray="1843 369" transform="rotate(120 512 512)"/>
    <line x1="406" y1="406" x2="302" y2="302" stroke-width="60"/>
    <line x1="618" y1="406" x2="722" y2="302" stroke-width="60"/>
    <line x1="406" y1="618" x2="302" y2="722" stroke-width="60"/>
    <line x1="618" y1="618" x2="722" y2="722" stroke-width="60"/>
  </g>
  <circle cx="512" cy="512" r="98" fill="#ffffff"/>
</svg>`;

const resvg = new Resvg(svg, { fitTo: { mode: "width", value: 44 } });
const png = resvg.render().asPng();
const out = new URL("../src-tauri/icons/tray-icon-template.png", import.meta.url);
writeFileSync(out, png);
console.log("src-tauri/icons/tray-icon-template.png written:", png.length, "bytes");
