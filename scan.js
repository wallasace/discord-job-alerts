// Varredura única: lista as vagas que passam no filtro, com texto e comentários (só leitura).
const { execSync } = require("child_process");
const fs = require("fs");
fs.writeFileSync("seen.json", "[]");
const out = execSync("node vagas.js --dry-run", { encoding: "utf8", maxBuffer: 1e8 });
const links = [...out.matchAll(/r\/(\S+) · (https:\/\/\S+)/g)].map((m) => m[2]);
const strip = (s) => s.replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/g, " ").replace(/\s+/g, " ").trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  for (const link of [...new Set(links)]) {
    console.log("\n##### " + link);
    try {
      const res = await fetch(link.replace(/\/?$/, "/.rss"), { headers: { "User-Agent": "job-alerts/1.0" } });
      if (!res.ok) { console.log("HTTP " + res.status); await sleep(8000); continue; }
      const xml = await res.text();
      const entries = xml.split("<entry>").slice(1);
      entries.slice(0, 9).forEach((e, i) => {
        const au = (e.match(/<name>([^<]*)/) || [])[1];
        const up = (e.match(/<updated>([^<]*)/) || [])[1];
        const t = (e.match(/<title>([^<]*)/) || [])[1];
        const c = strip((e.match(/<content[^>]*>([\s\S]*?)<\/content>/) || [])[1] || "");
        console.log((i ? "  [comentário] " : "[POST] ") + au + " " + (up || "").slice(0, 10) + (i ? "" : " | " + t) + "\n    " + c.slice(0, i ? 350 : 1500));
      });
      console.log("(total entradas: " + entries.length + ")");
    } catch (e) { console.log("erro " + e.message); }
    await sleep(8000);
  }
})();
