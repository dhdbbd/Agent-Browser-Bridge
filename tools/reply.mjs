import { readFileSync } from "node:fs";

const token = readFileSync(new URL("../bridge/.token", import.meta.url), "utf8").trim();
const text = readFileSync(process.argv[2], "utf8").trim();

const res = await fetch("http://127.0.0.1:8917/call", {
  method: "POST",
  headers: { "X-ZCBridge-Token": token, "Content-Type": "application/json" },
  body: JSON.stringify({ name: "browser_reply", args: { text } })
});
const j = await res.json();
console.log(j.ok ? j.result.content[0].text : "错误: " + j.error);
