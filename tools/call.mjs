import { readFileSync } from "node:fs";

const token = readFileSync(new URL("../bridge/.token", import.meta.url), "utf8").trim();
const name = process.argv[2];
const args = JSON.parse(process.argv[3] || "{}");

if (!name) {
  console.log("用法: node tools/call.mjs <tool> '<json args>'");
  process.exit(1);
}

const res = await fetch("http://127.0.0.1:8917/call", {
  method: "POST",
  headers: { "X-ZCBridge-Token": token, "Content-Type": "application/json" },
  body: JSON.stringify({ name, args })
});
const j = await res.json();
if (!j.ok) {
  console.log("错误:", j.error);
  process.exit(1);
}
for (const c of j.result.content || []) {
  if (c.type === "text") console.log(c.text);
  else if (c.type === "image") console.log(`[image ${c.mimeType}, ${Math.round((c.data || "").length / 1024)}KB base64]`);
}
