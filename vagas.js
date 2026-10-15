// Vagas pagas do Reddit -> canais do seu Discord, separadas por área (via webhooks).
// Lê o RSS dos subreddits, fica só com quem está CONTRATANDO, classifica a vaga
// (3D para jogos, 3D/CGI, game dev, programação, animação/mocap, audiovisual, design, IA)
// e posta no canal da área. Guarda o que já foi visto em seen.json.
//
// Uso:
//   node vagas.js            -> verifica uma vez e posta as novas
//   node vagas.js --dry-run  -> só mostra no terminal o que postaria e onde (não posta nada)
//   node vagas.js --loop     -> fica rodando e verifica a cada checkMinutes
//
// Configuração em config.json: webhookUrl (outras vagas) e routes (um webhook por área).

const fs = require("fs");
const path = require("path");

const DIR = __dirname;
const CONFIG_PATH = path.join(DIR, "config.json");
const SEEN_PATH = path.join(DIR, "seen.json");
const DRY_RUN = process.argv.includes("--dry-run");
const LOOP = process.argv.includes("--loop");

// Palavras que identificam cada área (palavra inteira, no título ou no texto)
const AREAS = {
  game: ["game", "games", "gamedev", "game dev", "indie", "unity", "unreal", "ue5", "uefn", "fortnite", "roblox", "godot", "steam", "mobile game", "rpg", "fps", "metroidvania", "vr game"],
  threeD: ["3d", "3d artist", "3d modeler", "3d modeller", "3d model", "3d models", "3d modeling", "3d modelling", "blender", "maya", "3ds max", "zbrush", "substance", "texturing", "lookdev", "technical artist", "tech artist", "low poly", "lowpoly", "hard surface", "props", "environment artist", "character artist", "render", "rendering", "archviz", "cgi"],
  programming: ["programmer", "developer", "engineer", "coder", "scripter", "c#", "c++", "javascript", "typescript", "python", "react", "node", "backend", "back-end", "frontend", "front-end", "full stack", "fullstack", "web app", "website", "api", "lua", "gdscript"],
  animation: ["animator", "animation", "animations", "rigging", "rigger", "rig", "motion capture", "mocap", "cleanup"],
  audiovisual: ["video editor", "video editing", "editor", "motion graphics", "motion designer", "after effects", "premiere", "davinci", "vfx", "trailer", "youtube", "sound designer", "sound design", "audio", "music", "composer", "sfx"],
  design: ["ui", "ux", "ui/ux", "graphic designer", "graphic design", "logo", "branding", "illustrator", "illustration", "concept art", "concept artist", "2d artist", "pixel art", "pixel artist", "figma", "icon", "icons", "sprite", "sprites"],
  ai: ["ai", "a.i.", "artificial intelligence", "machine learning", "llm", "gpt", "chatgpt", "stable diffusion", "comfyui", "midjourney", "generative", "prompt engineer"],
};

// Ordem de prioridade: a vaga vai para o PRIMEIRO canal que combinar
const ROUTING = [
  { key: "3d-games", label: "3D for games", test: (a) => a.threeD && a.game },
  { key: "game-dev", label: "Game dev", test: (a) => a.programming && a.game },
  { key: "animation-mocap", label: "Animation / mocap", test: (a) => a.animation },
  { key: "3d-cgi", label: "3D / CGI", test: (a) => a.threeD },
  { key: "ai", label: "AI", test: (a) => a.ai },
  { key: "audiovisual", label: "Audiovisual", test: (a) => a.audiovisual },
  { key: "design-2d", label: "Design / 2D", test: (a) => a.design },
  { key: "programming", label: "Programming", test: (a) => a.programming },
];

const AREA_LABELS = { game: "Games", threeD: "3D", programming: "Programming", animation: "Animation", audiovisual: "Audiovisual", design: "Design", ai: "AI" };

const DEFAULTS = {
  webhookUrl: "",   // canal de "outras vagas"
  routes: {},       // { "3d-games": "https://discord.com/api/webhooks/...", ... }
  subreddits: ["gameDevClassifieds", "forhire", "DesignJobs"],
  // Só vagas de quem está contratando (título)
  hiringTags: ["[hiring]", "[paid]", "[paid work]", "[task]", "hiring"],
  // Descarta quem oferece serviço, vaga sem pagamento e funções fora das suas áreas (título)
  excludeTags: [
    "[for hire]", "[forhire]", "for hire", "looking for work", "looking for paid", "looking for [paid]", "available for",
    "[unpaid]", "[rev-share]", "[revshare]", "rev share", "revenue share", "[hobby]",
    "voice actor", "voice over", "writer", "copywriter", "translator", "tester", "marketing", "virtual assistant", "data entry",
    "outreach", "influencer", "presenter", "on-camera", "on camera", "model for", "sales", "recruiter", "customer support",
  ],
  checkMinutes: 15,
  delayBetweenSubsSeconds: 6,
};

function loadConfig() {
  // Na nuvem (GitHub Actions) a configuração vem do Secret CONFIG_JSON; no PC, do config.json
  let raw = process.env.CONFIG_JSON;
  if (!raw) {
    if (!fs.existsSync(CONFIG_PATH)) {
      console.error(`Falta o arquivo config.json em ${DIR}. Copie config.example.json para config.json e cole o webhook.`);
      process.exit(1);
    }
    raw = fs.readFileSync(CONFIG_PATH, "utf8");
  }
  const cfg = { ...DEFAULTS, ...JSON.parse(raw) };
  const valid = (u) => /^https:\/\/(discord|discordapp)\.com\/api\/webhooks\//.test(u || "");
  if (!DRY_RUN && !valid(cfg.webhookUrl) && !Object.values(cfg.routes).some(valid)) {
    console.error("Nenhum webhook válido no config.json (webhookUrl ou routes).");
    process.exit(1);
  }
  return cfg;
}

function loadSeen() {
  try { return new Set(JSON.parse(fs.readFileSync(SEEN_PATH, "utf8"))); } catch { return new Set(); }
}

function saveSeen(seen) {
  // Mantém só os 3000 mais recentes para o arquivo não crescer para sempre
  fs.writeFileSync(SEEN_PATH, JSON.stringify([...seen].slice(-3000)));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function decodeEntities(s) {
  return s
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
}

function stripHtml(html) {
  return decodeEntities(decodeEntities(html))
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Parser simples do Atom que o Reddit devolve em /new/.rss
function parseFeed(xml) {
  const entries = [];
  for (const block of xml.split("<entry>").slice(1)) {
    const get = (re) => (block.match(re) || [])[1] || "";
    entries.push({
      id: get(/<id>([^<]+)<\/id>/),
      title: decodeEntities(get(/<title>([^<]*)<\/title>/)),
      link: get(/<link href="([^"]+)"/),
      updated: get(/<updated>([^<]+)<\/updated>/),
      author: get(/<name>([^<]+)<\/name>/),
      text: stripHtml(get(/<content type="html">([\s\S]*?)<\/content>/)),
    });
  }
  return entries;
}

async function fetchSub(sub) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(`https://www.reddit.com/r/${sub}/new/.rss?limit=50`, {
      headers: { "User-Agent": "vagas-gamedev-watcher/1.0 (personal job alerts)" },
    });
    if (res.status === 429 && attempt === 0) { await sleep(30000); continue; } // limite do Reddit: espera e tenta de novo
    if (!res.ok) throw new Error(`r/${sub}: HTTP ${res.status}`);
    return parseFeed(await res.text());
  }
}

// Procura a palavra inteira (evita "ios" casar com "studios", "ai" com "paid")
function hasWord(text, word) {
  const esc = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9#+])${esc}($|[^a-z0-9#+])`, "i").test(text);
}

const SKILLS = ["threeD", "programming", "animation", "audiovisual", "design", "ai"];
// Subreddits em que toda vaga é de jogo
const GAME_SUBS = ["gamedevclassifieds"];

function detect(text) {
  const found = {};
  // Aceita também o plural ("pixel artists", "developers")
  for (const [area, words] of Object.entries(AREAS)) found[area] = words.some((w) => hasWord(text, w) || hasWord(text, w + "s"));
  return found;
}

// Devolve { route, label, areas } se a vaga serve, ou null.
// O título manda: o texto só é usado quando o título não indica a área
// (o texto costuma citar outras áreas de passagem, ex.: "no AI", "the game is 3D").
function classify(entry, cfg, sub) {
  const title = entry.title.toLowerCase();
  if (cfg.excludeTags.some((t) => title.includes(t))) return null;
  if (!cfg.hiringTags.some((t) => title.includes(t))) return null;

  const inTitle = detect(title);
  const inText = detect(entry.text.toLowerCase());
  inText.ai = false; // IA só conta pelo título

  const titleHasSkill = SKILLS.some((s) => inTitle[s]);
  const areas = {};
  for (const s of SKILLS) areas[s] = titleHasSkill ? inTitle[s] : inText[s];
  areas.game = inTitle.game || inText.game || GAME_SUBS.includes(sub.toLowerCase());

  const hit = ROUTING.find((r) => r.test(areas));
  const found = Object.keys(areas).filter((a) => areas[a]).map((a) => AREA_LABELS[a]);
  if (hit) return { route: hit.key, label: hit.label, areas: found };
  // Vaga paga de jogos sem área clara: vai para "outras vagas"
  if (areas.game) return { route: "other", label: "Other", areas: found };
  return null;
}

function webhookFor(cfg, route) {
  return cfg.routes[route] || cfg.webhookUrl;
}

async function postToDiscord(url, entry, sub, match) {
  const body = {
    username: "Jobs",
    embeds: [{
      title: entry.title.slice(0, 256),
      url: entry.link,
      description: entry.text.slice(0, 600) + (entry.text.length > 600 ? "…" : ""),
      color: 0x4de1ff,
      fields: [
        { name: "Source", value: `r/${sub}`, inline: true },
        { name: "Category", value: match.label, inline: true },
        ...(match.areas.length ? [{ name: "Also matches", value: match.areas.join(", "), inline: true }] : []),
      ],
      footer: { text: entry.author ? `by ${entry.author}` : "Reddit" },
      timestamp: entry.updated || undefined,
    }],
  };
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.status === 429) { // limite do Discord: espera o tempo pedido
      const wait = Number((await res.json().catch(() => ({}))).retry_after || 2);
      await sleep(wait * 1000);
      continue;
    }
    if (!res.ok) throw new Error(`Discord: HTTP ${res.status} ${await res.text()}`);
    return;
  }
}

async function checkOnce(cfg) {
  const seen = loadSeen();
  const firstRun = seen.size === 0;
  const counts = {};

  for (const [i, sub] of cfg.subreddits.entries()) {
    if (i > 0) await sleep(cfg.delayBetweenSubsSeconds * 1000);
    let entries;
    try { entries = await fetchSub(sub); } catch (e) { console.error(`  ${e.message}`); continue; }

    // Mais antigas primeiro, para os canais ficarem em ordem cronológica
    for (const entry of entries.reverse()) {
      if (!entry.id || seen.has(entry.id)) continue;
      const match = classify(entry, cfg, sub);
      if (!DRY_RUN) seen.add(entry.id);
      if (!match) continue;
      counts[match.route] = (counts[match.route] || 0) + 1;
      if (DRY_RUN) {
        console.log(`[${match.route}] ${entry.title}\n   r/${sub} · ${entry.link}\n   areas: ${match.areas.join(", ")}`);
        continue;
      }
      const url = webhookFor(cfg, match.route);
      if (!url) continue;
      await postToDiscord(url, entry, sub, match);
      await sleep(1200);
    }
  }

  if (!DRY_RUN) saveSeen(seen);
  const when = new Date().toLocaleString("pt-BR");
  const summary = Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join(", ") || "nenhuma";
  console.log(`${when} — ${DRY_RUN ? "teste (nada postado)" : "postadas"}: ${summary}${firstRun && !DRY_RUN ? " (primeira execução)" : ""}`);
}

async function main() {
  const cfg = loadConfig();
  if (!LOOP) return checkOnce(cfg);
  for (;;) {
    await checkOnce(cfg).catch((e) => console.error(e.message));
    await sleep(cfg.checkMinutes * 60 * 1000);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
