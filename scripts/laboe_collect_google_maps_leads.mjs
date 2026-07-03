import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const leadSystemDir = process.cwd();
const userOutputDir = path.join(leadSystemDir, "lead_outputs");
const systemOutputDir = path.join(leadSystemDir, "lead_outputs");
const registryPath = path.join(leadSystemDir, "data", "contact_registry.json");
const date = process.argv[2] || new Date().toISOString().slice(0, 10);
const targetCount = Number(process.argv[3] ?? "100");
const campaignId = String(process.argv[4] || process.env.CAMPAIGN_ID || "design").toLowerCase();
if (!["design", "florist"].includes(campaignId)) throw new Error(`Unsupported campaign: ${campaignId}`);
const rebuildFromJson = process.argv.includes("--from-json");
const outputBaseName = `${campaignId}-${date}-google-maps-fresh-leads`;

const designExcludePatterns = [
  /\bhardware\b/i,
  /\bindian restaurant\b/i,
  /\bauto\b/i,
  /\bworkshop\b/i,
  /\btyre\b/i,
  /\bindustrial\b/i,
  /\bcontractor\b/i,
  /\bfruit\b/i,
  /\bfresh produce\b/i,
  /\bdental\b/i,
  /\bclinic\b/i,
  /\baesthetic\b/i,
  /\btrading\b/i,
  /\bsupplier\b/i,
  /\bwholesaler\b/i,
  /\bdistributor\b/i,
  /\bimport export\b/i,
  /\bmachinery\b/i,
  /\bspare parts\b/i,
  /\bhair\b/i,
  /\bsalon\b/i,
  /\bbarber\b/i,
  /\bnail\b/i,
  /\bsephora\b/i,
  /\bwatsons\b/i,
  /\bguardian\b/i,
  /\bsasa\b/i,
  /\byoung living\b/i,
  /\bmary kay\b/i,
  /\bthe body shop\b/i,
  /\bsk jewellery\b/i,
  /\bsiti khadijah\b/i,
  /\bmanjaku\b/i,
  /\bsamsung\b/i,
  /\bapple\b/i,
  /\bioi\b/i,
  /\bsunway\b/i,
  /\bpavilion\b/i,
  /\besthetics service\b/i,
];

// 马来文店名词:只对 business_name 匹配（不碰 address，因马来西亚地址本就含 Jalan/Taman 等马来文）
const designMalayNamePatterns = [
  /\bkedai\b/i,
  /\bemas\b/i,
  /\bruncit\b/i,
  /\bwarung\b/i,
  /\bgerai\b/i,
  /\bpasar(aya)?\b/i,
  /\bperniagaan\b/i,
  /\bborong\b/i,
  /\bjualan\b/i,
  /\bperabot\b/i,
  /\bbasikal\b/i,
  /\bubat\b/i,
];

const designSourceLanes = [
  ["beauty cosmetics shop", "Ampang"],
  ["skincare store", "Mont Kiara"],
  ["beauty product shop", "Bandar Sunway"],
  ["cosmetics store", "Kota Damansara"],
  ["k beauty store", "Bukit Jalil"],
  ["makeup store", "Sri Petaling"],
  ["spa products store", "Kajang"],
  ["beauty boutique", "Setia Alam"],
  ["skincare boutique", "Ara Damansara"],
  ["local cosmetics store", "Kepong"],
  ["beauty supply store", "Batu Pahat"],
  ["beauty supply store", "Muar"],
  ["beauty cosmetics shop", "Seremban"],
  ["cosmetics store", "Kuantan"],
  ["skincare store", "Sungai Petani"],
  ["beauty product shop", "Bukit Mertajam"],
  ["boutique clothing store", "Ampang"],
  ["fashion boutique", "Mont Kiara"],
  ["women boutique", "Bandar Sunway"],
  ["muslimah boutique", "Kajang"],
  ["baju kurung boutique", "Sri Petaling"],
  ["kids boutique", "Kota Damansara"],
  ["kids apparel store", "Setia Alam"],
  ["baby product store", "Puchong"],
  ["baby shop", "Subang Jaya"],
  ["maternity store", "Petaling Jaya"],
  ["mothercare baby product", "Kuala Lumpur"],
  ["kids product store", "Johor Bahru"],
  ["children toy store", "Penang"],
  ["baby boutique", "Melaka"],
  ["kids learning toy store", "Shah Alam"],
  ["bags boutique", "Bangsar"],
  ["accessories boutique", "Damansara Uptown"],
  ["fashion boutique", "Seremban"],
  ["fashion boutique", "Kuantan"],
  ["fashion boutique", "Muar"],
  ["fashion boutique", "Batu Pahat"],
  ["muslimah boutique", "Sungai Petani"],
  ["baju kurung boutique", "Bukit Mertajam"],
  ["fashion boutique", "Taiping"],
  ["fashion boutique", "Miri"],
  ["fashion boutique", "Sibu"],
  ["cake shop bakery", "Ampang"],
  ["bakery cafe", "Mont Kiara"],
  ["dessert cafe", "Bandar Sunway"],
  ["custom cake shop", "Kota Damansara"],
  ["cake delivery", "Kajang"],
  ["coffee roaster cafe", "Bangsar South"],
  ["dessert shop", "Damansara Uptown"],
  ["bakery cafe", "Sri Petaling"],
  ["cake shop bakery", "Seremban"],
  ["cake shop bakery", "Kuantan"],
  ["cake shop bakery", "Muar"],
  ["cake shop bakery", "Batu Pahat"],
  ["cake shop bakery", "Sungai Petani"],
  ["cake shop bakery", "Bukit Mertajam"],
  ["dessert cafe", "Taiping"],
  ["coffee roaster cafe", "Miri"],
  ["home decor shop", "Ampang"],
  ["home decor shop", "Mont Kiara"],
  ["homeware shop", "Bandar Sunway"],
  ["lighting decor shop", "Puchong Jaya"],
  ["curtain decor shop", "Kajang"],
  ["home fragrance shop", "Bangsar"],
  ["furniture decor store", "Setia Alam"],
  ["home decor shop", "Kota Damansara"],
  ["home decor shop", "Seremban"],
  ["home decor shop", "Kuantan"],
  ["home decor shop", "Muar"],
  ["home decor shop", "Batu Pahat"],
  ["home decor shop", "Sungai Petani"],
  ["home decor shop", "Bukit Mertajam"],
  ["home decor shop", "Taiping"],
  ["home decor shop", "Miri"],
  ["jewellery boutique", "Bangsar"],
  ["jewellery boutique", "Mont Kiara"],
  ["jewelry store", "Bandar Sunway"],
  ["watch shop", "Damansara Uptown"],
  ["accessories boutique", "Sri Petaling"],
  ["bags boutique", "Kota Damansara"],
  ["jewellery boutique", "Seremban"],
  ["jewellery boutique", "Kuantan"],
  ["jewellery boutique", "Bukit Mertajam"],
  ["jewellery boutique", "Miri"],
  ["wedding planner", "Bangsar South"],
  ["event styling", "Mont Kiara"],
  ["party decoration", "Bandar Sunway"],
  ["balloon decoration", "Puchong Jaya"],
  ["gift hamper shop", "Bangsar"],
  ["gift hamper shop", "Sri Petaling"],
  ["hamper gift delivery", "Kajang"],
  ["gift hamper shop", "Seremban"],
  ["party decoration", "Kuantan"],
  ["pet shop", "Ampang"],
  ["pet supplies", "Mont Kiara"],
  ["pet grooming", "Bandar Sunway"],
  ["pet bakery", "Damansara Uptown"],
  ["pilates studio", "Bangsar"],
  ["yoga studio", "Mont Kiara"],
  ["dance studio", "Bandar Sunway"],
  ["fitness studio", "Kota Damansara"],
  ["mobile phone accessories", "Sri Petaling"],
  ["mobile phone accessories", "Kepong"],
  ["gadget accessories shop", "Kajang"],
  ["gadget accessories shop", "Setia Alam"],
  // —— florist lane 已移出 design（2026-07-03）：花店归 florist campaign 独占，避免同店被两条线各发一次 ——
  // —— 城市扩展 (2026-06-13)：核心行业词 × 新增城市，扩大供给池 ——
  ...["Cheras", "Setapak", "Wangsa Maju", "Selayang", "Klang", "Rawang", "Semenyih", "Cyberjaya", "Putrajaya", "Sungai Buloh", "Seri Kembangan", "George Town", "Bayan Lepas", "Butterworth", "Iskandar Puteri", "Kulai", "Skudai", "Ipoh"]
    .flatMap((city) => ["beauty cosmetics shop", "skincare store", "fashion boutique", "muslimah boutique", "baby product store", "kids boutique", "home decor shop", "jewellery boutique", "cake shop bakery"].map((q) => [q, city])),
  // —— 城市扩展 #2 (2026-06-13)：填补空白州 + 新加坡 + 加厚 ——
  ...["Bukit Bintang", "KLCC", "Sentul", "Sri Hartamas", "Desa ParkCity", "Brickfields", "Old Klang Road", "Sungai Besi", "Bandar Kinrara", "USJ", "Kota Kemuning", "Bangi", "Batu Caves", "Gombak", "Banting", "Tanjung Tokong", "Gelugor", "Air Itam", "Seberang Jaya", "Bukit Indah", "Permas Jaya", "Pasir Gudang", "Senai", "Kluang", "Segamat", "Pontian", "Sitiawan", "Teluk Intan", "Kampar", "Alor Setar", "Bentong", "Temerloh", "Nilai", "Port Dickson", "Ayer Keroh", "Kota Kinabalu", "Penampang", "Sandakan", "Kuching", "Bintulu", "Kota Bharu", "Kuala Terengganu", "Kangar"]
    .flatMap((city) => ["beauty cosmetics shop", "skincare store", "fashion boutique", "muslimah boutique", "baby product store", "kids boutique", "home decor shop", "jewellery boutique", "cake shop bakery"].map((q) => [q, city])),
];

// Order = priority (drives candidateSort rank + fill order). Mix updated 2026-06-24.
const designTargetQuotas = new Map([
  ["jewelry / watches / accessories", 25],
  ["maternity / baby / kids product", 20],
  ["event / wedding / party / gifting", 15],
  ["fashion / apparel / boutique", 18],
  ["beauty / skincare / cosmetics", 15],
  ["home / living / decor", 7],
]);

const designIndustryCaps = new Map([
  ["restaurant / cafe / bakery", 3],
  ["electronics / gadgets", 5],
  ["pet / lifestyle services", 2],
  ["fitness / studio", 2],
  ["other visual-driven SME", 5],
]);

// —— Florist campaign (2026-07-02)：全马只抓花店，其余管线与 design 完全一致 ——
const floristCities = [
  // 巴生谷核心
  "Kuala Lumpur", "Petaling Jaya", "Shah Alam", "Klang", "Subang Jaya",
  "Puchong", "Cheras", "Kajang", "Bangi", "Rawang", "Selayang",
  "Ampang", "Mont Kiara", "Bangsar", "Kepong", "Setapak", "Wangsa Maju",
  "Kota Damansara", "Setia Alam", "Sri Petaling", "Bukit Jalil", "Cyberjaya",
  "Putrajaya", "Sungai Buloh", "Seri Kembangan", "USJ", "Semenyih", "Banting",
  // 北马
  "George Town", "Bayan Lepas", "Butterworth", "Bukit Mertajam", "Seberang Jaya",
  "Alor Setar", "Sungai Petani", "Ipoh", "Taiping", "Sitiawan", "Teluk Intan", "Kangar",
  // 南马
  "Seremban", "Nilai", "Port Dickson", "Melaka", "Ayer Keroh",
  "Johor Bahru", "Iskandar Puteri", "Skudai", "Kulai", "Bukit Indah",
  "Batu Pahat", "Muar", "Kluang", "Segamat", "Pontian",
  // 东海岸
  "Kuantan", "Temerloh", "Bentong", "Kota Bharu", "Kuala Terengganu",
  // 东马
  "Kota Kinabalu", "Penampang", "Sandakan", "Kuching", "Miri", "Sibu", "Bintulu",
];

const floristQueries = [
  "florist",
  "flower shop",
  "flower delivery",
  "florist gift shop",
  "wedding florist",
  "flower boutique",
  "online florist",
  "kedai bunga",
];

const floristSourceLanes = floristCities.flatMap((city) => floristQueries.map((query) => [query, city]));

// 任何花店都收，只排明显不是花店零售的
const floristExcludePatterns = [
  /\bnursery\b/i,
  /\blandscap/i,
  /\bgarden cent(re|er)\b/i,
  /\bhardware\b/i,
  /\bfuneral (home|parlour|parlor|services)\b/i,
  /\bartificial flower (factory|manufacturer)\b/i,
];

const floristTargetQuotas = new Map([
  ["florist / gifting / lifestyle retail", 100],
]);

const floristIndustryCaps = new Map();

const sourceLanes = campaignId === "florist" ? floristSourceLanes : designSourceLanes;
const excludePatterns = campaignId === "florist" ? floristExcludePatterns : designExcludePatterns;
const malayNamePatterns = campaignId === "florist" ? [] : designMalayNamePatterns;
const targetQuotas = campaignId === "florist" ? floristTargetQuotas : designTargetQuotas;
const industryCaps = campaignId === "florist" ? floristIndustryCaps : designIndustryCaps;

const columns = [
  "date",
  "priority_rank",
  "suggested_send_batch",
  "business_name",
  "industry",
  "source_platform",
  "source_lane",
  "google_maps_url",
  "website_or_social_url",
  "address",
  "city",
  "country",
  "phone",
  "contact_channel",
  "contact_details",
  "whatsapp_click_to_send_link",
  "active_or_public_evidence",
  "observed_design_need",
  "recommended_angle",
  "suggested_opening_message",
  "lead_grade",
  "next_action",
  "dedupe_key",
  "maps_category",
  "rating",
  "reviews",
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 每次只跑随机抽样的 N 条 lane，运行时间封顶、多次采集轮换覆盖全部城市。
function sampleLanes(lanes, n) {
  if (!n || n >= lanes.length) return lanes;
  const arr = [...lanes];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, n);
}

async function curl(url) {
  const { stdout } = await execFileAsync("curl", [
    "-L",
    "--silent",
    "--show-error",
    "--max-time",
    "30",
    "-A",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
    "-H",
    "accept-language: en-US,en;q=0.9",
    url,
  ], { maxBuffer: 80 * 1024 * 1024 });
  return stdout;
}

function decodeEntities(value) {
  return String(value ?? "")
    .replace(/\\u003d/g, "=")
    .replace(/\\u0026/g, "&")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function normalizePhone(value) {
  return String(value ?? "").replace(/\D/g, "");
}

function normalizeMalaysiaPhone(value) {
  let digits = normalizePhone(value);
  if (!digits) return "";
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = `6${digits}`;
  return digits;
}

function isMobileWhatsapp(digits) {
  return /^601\d{8,9}$/.test(digits);
}

function reviewCountNumber(value) {
  const digits = String(value ?? "").replace(/[^\d]/g, "");
  return digits ? Number(digits) : 0;
}

function normalizeText(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function mapsUrl(name, address) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name} ${address}`.trim())}`;
}

function waLink(phone, message) {
  const digits = normalizeMalaysiaPhone(phone);
  if (!isMobileWhatsapp(digits)) return "";
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

function industryFrom(categoryText, queryText) {
  const text = `${categoryText} ${queryText}`.toLowerCase();
  // florist campaign 里花店判定优先（否则 "wedding florist" lane 会先命中 event/wedding，破坏 100% 花店配额）
  if (campaignId === "florist" && /florist|flower|bouquet|bunga/.test(text)) return "florist / gifting / lifestyle retail";
  if (/wedding|event|party|balloon|hamper|gift hamper/.test(text)) return "event / wedding / party / gifting";
  if (/\bpet\b|pet shop|pet supply|pet supplies|pet food|pet bakery|pet grooming|\bgrooming\b/.test(text)) return "pet / lifestyle services";
  if (/pilates|yoga|dance|fitness|gym|studio/.test(text)) return "fitness / studio";
  if (/florist|flower|bouquet/.test(text)) return "florist / gifting / lifestyle retail";
  if (/cosmetic|beauty|skincare|skin care|makeup/.test(text)) return "beauty / skincare / cosmetics";
  if (/maternity|pregnan|mother|baby|kids|children|child|toy|learning toy/.test(text)) return "maternity / baby / kids product";
  if (/jewel|jewelry|jewellery|watch/.test(text)) return "jewelry / watches / accessories";
  if (/fashion|boutique|clothing|women|apparel|shoe|bag/.test(text)) return "fashion / apparel / boutique";
  if (/home|decor|furniture|living/.test(text)) return "home / living / decor";
  if (/electronic|gadget|mobile|accessor/.test(text)) return "electronics / gadgets";
  if (/bakery|cake|cafe|dessert|restaurant|coffee/.test(text)) return "restaurant / cafe / bakery";
  return "other visual-driven SME";
}

function buildAngle(industry, name) {
  if (industry === "beauty / skincare / cosmetics") {
    return `${name} already has a product-led retail presence, and stronger product visuals, launch creatives, and short-form social content could make the brand look more premium online.`;
  }
  if (industry === "florist / gifting / lifestyle retail") {
    return `${name} sells highly visual products, so seasonal campaign graphics, bouquet/gift photography, and clearer promo creatives could help convert more casual browsers.`;
  }
  if (industry === "fashion / apparel / boutique") {
    return `${name} can benefit from cleaner lookbook visuals, social media templates, and campaign assets that make new arrivals easier to browse and share.`;
  }
  if (industry === "maternity / baby / kids product") {
    return `${name} serves parents and families, so stronger trust-led product visuals, packaging, campaign creatives, and social content could make the brand feel clearer and more reliable.`;
  }
  if (industry === "home / living / decor") {
    return `${name} has products where styling matters, so better catalog visuals, room-setting content, and website/social creatives could lift perceived value.`;
  }
  if (industry === "jewelry / watches / accessories") {
    return `${name} sells detail-driven products, so sharper close-up visuals, premium product layouts, and campaign content could make the items feel more desirable.`;
  }
  if (industry === "electronics / gadgets") {
    return `${name} can use clearer product comparison visuals, simple explainer creatives, and promo graphics to help customers understand value faster.`;
  }
  if (industry === "restaurant / cafe / bakery") {
    return `${name} depends heavily on visual appetite appeal, so menu/product photos, promo posters, and short social content could help drive more walk-ins and orders.`;
  }
  if (industry === "event / wedding / party / gifting") {
    return `${name} likely sells moments and packages, so clearer package visuals, event galleries, promo posts, and seasonal campaign assets could make enquiries easier to convert.`;
  }
  if (industry === "pet / lifestyle services") {
    return `${name} speaks to pet owners, so warmer social content, service/product visuals, and simple promo creatives could help the brand feel more friendly and memorable.`;
  }
  if (industry === "fitness / studio") {
    return `${name} can benefit from clearer class/program visuals, promo posts, short video assets, and social templates that help people understand the experience quickly.`;
  }
  return `${name} appears to be a visual-driven local business where stronger social, product, and promo assets could support customer enquiries.`;
}

function buildObservedNeed(industry) {
  if (industry === "restaurant / cafe / bakery") return "Food/product visuals and promo content need to look appetizing and consistent across Maps/social.";
  if (industry === "beauty / skincare / cosmetics") return "Product and retail visuals need a more premium, campaign-ready look.";
  if (industry === "home / living / decor") return "Catalog and lifestyle visuals need clearer styling to show product value.";
  if (industry === "fashion / apparel / boutique") return "New-arrival and lookbook content needs more consistent visual direction.";
  if (industry === "maternity / baby / kids product") return "Parent-facing product visuals need clear trust cues, friendly packaging, and polished social content.";
  if (industry === "florist / gifting / lifestyle retail") return "Gift/seasonal content needs strong photos, layout, and promo graphics.";
  if (industry === "jewelry / watches / accessories") return "Detail product shots and premium social layouts can be stronger.";
  if (industry === "electronics / gadgets") return "Product benefits need clearer visual explanation and promo layouts.";
  if (industry === "event / wedding / party / gifting") return "Packages, event galleries, and promo content need strong visual storytelling.";
  if (industry === "pet / lifestyle services") return "Friendly service/product visuals and social content can make the brand more approachable.";
  if (industry === "fitness / studio") return "Class, membership, and promo visuals need to be clearer and more consistent.";
  return "Public listing suggests room for stronger social and promotional visuals.";
}

function stableIndex(value, length) {
  let hash = 0;
  for (const char of String(value)) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash % length;
}

// {{SENDER}} / {{COMPANY}} 占位符 —— portal 渲染时替换成商户自填的名字/公司。
// 店名 {name} 在采集时烘进文案。每条用 \n\n 分 4 段(开场 / 服务 / 为什么找你 / soft ask);
// portal segmentMessage 见到 \n 即原样返回(幂等),wa 链接 encodeURIComponent("\n")=%0A 认换行。
const SERVICE_LINE =
  "websites, branding, social media content, video, animation, and SaaS systems";

// 5 框架 × 3 措辞变体 = 15 条。6 项服务清单本身保持 canonical(单一 SERVICE_LINE),
// 只变其周围动词/框架措辞 + 开场/为什么找你/soft ask,打散高频重复短语降批量判垃圾。
const messageFrameworks = [
  // 1 · 具体观察式 —— 先夸一处方向
  (name) =>
    `Hi, this is {{SENDER}} from {{COMPANY}}, a KL-based creative studio.\n\n` +
    `Came across ${name} — really like the direction you're building.\n\n` +
    `We help brands with ${SERVICE_LINE}.\n\n` +
    `Mind if I send over 2–3 relevant samples?`,
  (name) =>
    `Hi there, {{SENDER}} here from {{COMPANY}}, a creative studio based in Malaysia.\n\n` +
    `Stumbled on ${name} and genuinely liked what you're doing.\n\n` +
    `We work across ${SERVICE_LINE}.\n\n` +
    `Okay if I drop a couple of relevant samples your way?`,
  (name) =>
    `Good day! This is {{SENDER}} from {{COMPANY}}, a KL creative studio.\n\n` +
    `Been looking at ${name} — the brand has a really nice direction.\n\n` +
    `We cover ${SERVICE_LINE}.\n\n` +
    `Would it help if I shared 2–3 samples close to your space?`,
  // 2 · 价值先行式 —— 先给一个想法
  (name) =>
    `Hi there, this is {{SENDER}} from {{COMPANY}}.\n\n` +
    `We're a Malaysia-based creative studio working on ${SERVICE_LINE}.\n\n` +
    `I had a quick idea for how ${name} could level up its online look without a full rebuild.\n\n` +
    `Happy to share the idea and a few samples if you're open?`,
  (name) =>
    `Hi, {{SENDER}} here from {{COMPANY}}, a creative studio in Malaysia.\n\n` +
    `We handle ${SERVICE_LINE}.\n\n` +
    `A small idea came to mind for how ${name} could sharpen its online presence without starting over.\n\n` +
    `Want me to send the idea along with a few samples?`,
  (name) =>
    `Good day — this is {{SENDER}} from {{COMPANY}}.\n\n` +
    `We're a KL creative studio doing ${SERVICE_LINE}.\n\n` +
    `I think there's an easy win to lift how ${name} looks online without a big revamp.\n\n` +
    `Glad to walk you through it with a couple of samples, if that's useful?`,
  // 3 · 社会证明式 —— 先放同类案例
  (name) =>
    `Hi there, this is {{SENDER}} from {{COMPANY}}, a Malaysia-based creative studio.\n\n` +
    `We help brands with ${SERVICE_LINE}.\n\n` +
    `We've done this for a few local brands and it moved the needle — and I came across ${name} feeling it could benefit from the same.\n\n` +
    `Okay if I send a couple of those examples?`,
  (name) =>
    `Hi, {{SENDER}} here from {{COMPANY}}, a creative studio based in Malaysia.\n\n` +
    `We cover ${SERVICE_LINE}.\n\n` +
    `A few local brands we worked with saw a real lift — and ${name} feels like it'd benefit the same way.\n\n` +
    `Mind if I share a couple of those examples?`,
  (name) =>
    `Good day! This is {{SENDER}} from {{COMPANY}}, a KL creative studio.\n\n` +
    `We work across ${SERVICE_LINE}.\n\n` +
    `We've helped similar local brands get noticeably stronger results, and ${name} came to mind.\n\n` +
    `Happy to send a couple of examples if you'd like to see?`,
  // 4 · 提问式 —— 用问题开场
  (name) =>
    `Hi there, this is {{SENDER}} from {{COMPANY}}.\n\n` +
    `We're a Malaysia-based creative studio doing ${SERVICE_LINE}.\n\n` +
    `Quick one — is ${name} planning to refresh its website or content this year?\n\n` +
    `If the timing's right, I'd love to share a few samples.`,
  (name) =>
    `Hi, {{SENDER}} here from {{COMPANY}}, a creative studio in Malaysia.\n\n` +
    `We handle ${SERVICE_LINE}.\n\n` +
    `Quick question — is ${name} looking to refresh its branding or online presence anytime soon?\n\n` +
    `If it's on the cards, I'm happy to send a few samples.`,
  (name) =>
    `Good day — this is {{SENDER}} from {{COMPANY}}, a KL creative studio.\n\n` +
    `We cover ${SERVICE_LINE}.\n\n` +
    `Just curious — is updating the website or content something ${name} has in mind this year?\n\n` +
    `If so, I'd be glad to share a few relevant samples.`,
  // 5 · 直给式 —— 零废话
  (name) =>
    `Hi there, this is {{SENDER}} from {{COMPANY}}, a Malaysia-based creative studio.\n\n` +
    `We do ${SERVICE_LINE} for brands like ${name}.\n\n` +
    `I came across you recently and thought some of our work might be a fit.\n\n` +
    `Would it be okay if I shared a few samples with you?`,
  (name) =>
    `Hi, {{SENDER}} here from {{COMPANY}}, a creative studio in Malaysia.\n\n` +
    `We build ${SERVICE_LINE} for brands like ${name}.\n\n` +
    `Came across you the other day and felt our work could be relevant.\n\n` +
    `Mind if I send a few samples over?`,
  (name) =>
    `Good day! This is {{SENDER}} from {{COMPANY}}, a KL creative studio.\n\n` +
    `We provide ${SERVICE_LINE} for brands like ${name}.\n\n` +
    `Found you recently and thought there might be a good fit.\n\n` +
    `Would it be alright if I shared some samples?`,
];

// —— Florist campaign 专属开场白(2026-07-03)——
// 卖点 = 帮花店做「在线目录 + 一键 WhatsApp 下单站」(Hanna Flower 那套),解决散乱私讯接单。
// 同结构:4 段 \n\n(问候+身份 / 痛点或钩子 / 解法 / soft ask),{{SENDER}}/{{COMPANY}} 门户渲染时替换,店名烘进。
// 5 框架 × 3 变体 = 15 条,stableIndex 轮替,打散重复短语降批量判垃圾。
const floristMessageFrameworks = [
  // 1 · 痛点观察式 —— 先点散乱私讯接单的痛
  (name) =>
    `Hi, this is {{SENDER}} from {{COMPANY}}, a Malaysia-based studio for florists.\n\n` +
    `Came across ${name} — most flower shops still take every order through scattered WhatsApp and IG chats, and it's easy to lose one on a busy day.\n\n` +
    `We set up a simple page where your customers browse the full range with prices and order in one tap on WhatsApp.\n\n` +
    `We've got one live for a local florist — want me to send you her page to see it?`,
  (name) =>
    `Hi there, {{SENDER}} here from {{COMPANY}}, we build online shops for florists.\n\n` +
    `Noticed ${name} — when orders come in through DMs one by one, festive days get messy and some slip through.\n\n` +
    `We put your whole catalogue online so customers pick, see prices, and order straight to your WhatsApp — no back and forth.\n\n` +
    `Okay if I share a live example we built for another florist?`,
  (name) =>
    `Good day! This is {{SENDER}} from {{COMPANY}}, a studio that works with florists.\n\n` +
    `Had a look at ${name} — taking orders by chat means answering "got this? how much?" all day and still missing a few.\n\n` +
    `We give you one clean page: every arrangement, every price, order in a tap on WhatsApp.\n\n` +
    `Would it help if I sent you a florist page we've already got running?`,
  // 2 · 结果先行式 —— 先给一个具体好处
  (name) =>
    `Hi, {{SENDER}} here from {{COMPANY}}.\n\n` +
    `Quick idea for ${name}: imagine customers ordering your bouquets in one tap, even at midnight, without you replying to a single chat.\n\n` +
    `That's what we build for florists — a clean online catalogue with prices that sends orders straight to your WhatsApp.\n\n` +
    `One florist we set up now takes orders while she sleeps — want to see her page?`,
  (name) =>
    `Hi there, this is {{SENDER}} from {{COMPANY}}.\n\n` +
    `What if ${name} could show every arrangement online and let customers order in one tap, instead of chasing DMs?\n\n` +
    `We set that up for florists — browse, price, order to your WhatsApp, all on one page.\n\n` +
    `Happy to send you a live florist page so you can see how it works?`,
  (name) =>
    `Good day — {{SENDER}} from {{COMPANY}} here.\n\n` +
    `Small idea for ${name}: a page where customers see your full range, know the price, and order in a tap — orders keep coming even when you're closed.\n\n` +
    `We build exactly that for flower shops, wired to your WhatsApp.\n\n` +
    `Want me to drop you a live example to look at?`,
  // 3 · 案例/社会证明式 —— 先放实跑的花店样板
  (name) =>
    `Hi there, this is {{SENDER}} from {{COMPANY}}, we build ordering pages for florists.\n\n` +
    `We recently set one up for a local flower shop — customers browse the whole range and order directly, no more one-by-one DMs.\n\n` +
    `Came across ${name} and felt the same setup would fit you really well.\n\n` +
    `Mind if I send you her live page to have a look?`,
  (name) =>
    `Hi, {{SENDER}} here from {{COMPANY}}.\n\n` +
    `We built an online ordering page for a florist and her customers now pick and order in one tap — she's not glued to WhatsApp all day.\n\n` +
    `${name} came to mind as a shop that could run the same way.\n\n` +
    `Okay if I share the live example with you?`,
  (name) =>
    `Good day! This is {{SENDER}} from {{COMPANY}}, a studio for florists.\n\n` +
    `One flower shop we set up online now takes cleaner orders with far less back-and-forth — the page does the work.\n\n` +
    `Saw ${name} and thought it'd suit you too.\n\n` +
    `Happy to send you that live page if you'd like to see?`,
  // 4 · 提问式 —— 用问题开场
  (name) =>
    `Hi there, this is {{SENDER}} from {{COMPANY}}, we make ordering pages for florists.\n\n` +
    `Quick one — how do customers order from ${name} now, mostly WhatsApp and Instagram?\n\n` +
    `We put your full catalogue online so they pick, see the price, and order in one tap — a big help on busy festive days.\n\n` +
    `Happy to show you a live florist page we built, if you're keen?`,
  (name) =>
    `Hi, {{SENDER}} here from {{COMPANY}}.\n\n` +
    `Curious — does ${name} take most orders through DMs right now?\n\n` +
    `If so, we can put everything on one page where customers order straight to your WhatsApp, so nothing gets missed.\n\n` +
    `Want me to send a live example we set up for another florist?`,
  (name) =>
    `Good day — {{SENDER}} from {{COMPANY}} here.\n\n` +
    `Just wondering how ${name} handles orders on peak days like Valentine's or Mother's Day?\n\n` +
    `We build florists a simple ordering page so the rush runs itself — customers browse, price, and order in a tap.\n\n` +
    `Glad to share a live florist page if that's useful?`,
  // 5 · 直给式 —— 零废话
  (name) =>
    `Hi there, this is {{SENDER}} from {{COMPANY}}, a Malaysia studio for florists.\n\n` +
    `We build online ordering pages for flower shops like ${name} — full catalogue, prices, order in one tap on WhatsApp.\n\n` +
    `Came across you recently and thought it'd be a good fit.\n\n` +
    `Would it be okay if I sent you a live florist page to see?`,
  (name) =>
    `Hi, {{SENDER}} here from {{COMPANY}}.\n\n` +
    `We set florists up with a clean online shop — customers browse every bouquet, see prices, and order straight to your WhatsApp.\n\n` +
    `Found ${name} the other day and felt it could really work for you.\n\n` +
    `Mind if I send a live example over?`,
  (name) =>
    `Good day! This is {{SENDER}} from {{COMPANY}}.\n\n` +
    `We give flower shops like ${name} one page to sell from — full range, prices, one-tap WhatsApp ordering.\n\n` +
    `Came across you and thought there's a good fit here.\n\n` +
    `Alright if I share a florist page we've got live?`,
];

// industry / angle 仍按 lead 存进 recommended_angle / observed_design_need 字段(portal 作 lead 元数据展示),
// 但不再进开场白本体 —— design 用 messageFrameworks、florist 用 floristMessageFrameworks,各 15 条轮替。
function buildMessage(name, industry, angle, seed = "") {
  const pool = campaignId === "florist" ? floristMessageFrameworks : messageFrameworks;
  const idx = stableIndex(`framework|${seed}|${name}`, pool.length);
  return pool[idx](name);
}

function isExcluded(row) {
  const haystack = [
    row.business_name,
    row.industry,
    row.maps_category,
    row.address,
    row.source_lane,
  ].filter(Boolean).join(" ");
  if (excludePatterns.some((pattern) => pattern.test(haystack))) return true;
  if (malayNamePatterns.some((pattern) => pattern.test(row.business_name || ""))) return true;
  if (reviewCountNumber(row.reviews) > 2000) return true;
  return false;
}

function traverse(node, visit) {
  if (!Array.isArray(node)) return;
  visit(node);
  for (const child of node) {
    if (Array.isArray(child)) traverse(child, visit);
  }
}

function collectStrings(node, out = []) {
  if (typeof node === "string") out.push(decodeEntities(node));
  else if (Array.isArray(node)) {
    for (const child of node) collectStrings(child, out);
  }
  return out;
}

function findPhone(node) {
  let result = null;
  traverse(node, (arr) => {
    if (result) return;
    if (
      typeof arr[0] === "string" &&
      Array.isArray(arr[1]) &&
      typeof arr[3] === "string" &&
      Array.isArray(arr[5]) &&
      typeof arr[5][0] === "string" &&
      arr[5][0].startsWith("tel:")
    ) {
      const intl = arr[1].find((item) => Array.isArray(item) && item[1] === 2)?.[0] ?? arr[0];
      result = { display: arr[0], digits: arr[3], international: intl };
    }
  });
  return result;
}

function findOpenStatus(node) {
  const strings = collectStrings(node);
  return strings.find((value) => /^Open\b|^Closed\b|Open ·|Closed ·/.test(value)) ?? "Public Google Maps listing";
}

function findReviewCount(node, token) {
  let result = "";
  traverse(node, (arr) => {
    if (result !== "") return;
    if (arr[0] === null && Number.isInteger(arr[1]) && arr[1] > 0 && arr[1] < 100000 && arr[3] === token) {
      result = arr[1];
    }
  });
  return result;
}

function findAddress(node, fallbackParts, city) {
  const strings = collectStrings(node)
    .filter((value) => value.length >= 20 && value.length <= 220)
    .filter((value) => !/^https?:/i.test(value))
    .filter((value) => !value.includes("SearchResult."))
    .filter((value) => /(Kuala Lumpur|Selangor|Johor|Penang|Ipoh|Melaka|Kuching|Kinabalu|Wilayah|Malaysia|Singapore)/i.test(value));
  if (strings.length) {
    return strings.sort((a, b) => a.length - b.length)[0];
  }
  return [fallbackParts, city, "Malaysia"].flat().filter(Boolean).join(", ");
}

function parsePayload(payload, query, city) {
  const clean = payload.replace(/^\)\]\}'\s*/, "");
  const json = JSON.parse(clean);
  const rows = [];
  const seenNodes = new Set();

  traverse(json, (arr) => {
    if (
      typeof arr[11] === "string" &&
      Array.isArray(arr[13]) &&
      typeof arr[10] === "string" &&
      arr[10].startsWith("0x") &&
      !seenNodes.has(arr)
    ) {
      seenNodes.add(arr);
      const name = decodeEntities(arr[11]).trim();
      const categories = arr[13].map((item) => decodeEntities(item)).filter(Boolean);
      const categoryText = categories.join(", ");
      const industry = industryFrom(categoryText, query);
      const phone = findPhone(arr);
      if (!phone) return;
      const normalizedPhone = normalizeMalaysiaPhone(phone.international || phone.display || phone.digits);
      if (!normalizedPhone) return;
      if (!isMobileWhatsapp(normalizedPhone)) return;
      const website = Array.isArray(arr[7]) ? decodeEntities(arr[7][0] ?? "") : "";
      const address = findAddress(arr, arr[2], city);
      const rating = Array.isArray(arr[4]) ? arr[4][7] ?? "" : "";
      const reviews = findReviewCount(arr, arr[0]);
      const angle = buildAngle(industry, name);
      const message = buildMessage(name, industry, angle, `${normalizedPhone}|${address}`);
      const row = {
        date,
        business_name: name,
        industry,
        source_platform: "Google Maps",
        source_lane: `${query} ${city}`,
        google_maps_url: mapsUrl(name, address),
        website_or_social_url: website,
        address,
        city,
        country: normalizedPhone.startsWith("65") ? "Singapore" : "Malaysia",
        phone: normalizedPhone,
        contact_channel: "Mobile / WhatsApp likely",
        contact_details: phone.international || phone.display || normalizedPhone,
        whatsapp_click_to_send_link: waLink(normalizedPhone, message),
        active_or_public_evidence: findOpenStatus(arr),
        observed_design_need: buildObservedNeed(industry),
        recommended_angle: angle,
        suggested_opening_message: message,
        lead_grade: "A",
        next_action: "Send WhatsApp opener manually; mark green/red/no reply after sending.",
        dedupe_key: `${normalizeText(name)}|${normalizedPhone}|${normalizeText(address)}`,
        maps_category: categoryText,
        rating,
        reviews,
      };
      rows.push(row);
    }
  });
  return rows;
}

async function fetchMapsRows(query, city) {
  const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(`${query} ${city}`)}`;
  const html = await curl(searchUrl);
  const preload = html.match(/<link href="([^"]*\/search\?tbm=map[^"]+)"/);
  if (!preload) return [];
  const endpoint = new URL(decodeEntities(preload[1]), "https://www.google.com").toString();
  const payload = await curl(endpoint);
  return parsePayload(payload, query, city);
}

async function loadHistoryKeys() {
  const registry = campaignId === "design"
    ? JSON.parse(await fs.readFile(registryPath, "utf8"))
    : {};
  const keys = {
    phones: new Set([...(registry.contactedPhones ?? []), ...(registry.blockedPhones ?? []), ...(registry.interestedPhones ?? [])].map(normalizeMalaysiaPhone)),
    brands: new Set([...(registry.contactedBrands ?? []), ...(registry.blockedBrands ?? [])].map(normalizeText)),
    urls: new Set(),
    websites: new Set(),
    addresses: new Set(),
    dedupeKeys: new Set(),
  };

  const outputFiles = await fs.readdir(systemOutputDir);
  for (const file of outputFiles.filter((name) =>
    name === "supabase-history.json" || name.startsWith(`${campaignId}-`) && name.endsWith(".json")
  )) {
    if (file.startsWith(outputBaseName)) continue;
    try {
      const parsed = JSON.parse(await fs.readFile(path.join(systemOutputDir, file), "utf8"));
      const rows = Array.isArray(parsed) ? parsed : [...(parsed.newLeads ?? []), ...(parsed.followUps ?? [])];
      for (const row of rows) {
        const phone = normalizeMalaysiaPhone(row.phone ?? row.contact_details ?? row.contactDetails ?? "");
        if (phone) keys.phones.add(phone);
        const brand = normalizeText(row.business_name ?? row.brand ?? row.company ?? "");
        if (brand) keys.brands.add(brand);
        const url = normalizeText(row.google_maps_url ?? row.link ?? row.maps_link ?? "");
        if (url) keys.urls.add(url);
        const website = normalizeText(row.website_or_social_url ?? row.website ?? row.company_website ?? "");
        if (website) keys.websites.add(website);
        const address = normalizeText(row.address ?? "");
        if (address) keys.addresses.add(address);
        const dedupeKey = normalizeText(row.dedupe_key ?? "");
        if (dedupeKey) keys.dedupeKeys.add(dedupeKey);
      }
    } catch {
      // Some experimental JSON files are not lead packs; skip them.
    }
  }
  return keys;
}

// Dedupe only on signals that identify the SAME contactable business:
// phone, Maps listing URL, or the exact name+phone+address key. We intentionally
// do NOT suppress on business name / website / address alone, so a brand with a
// different phone and address (e.g. a separate outlet) is kept as a new lead.
function isHistoricalDuplicate(row, history, localSeen) {
  const phone = normalizeMalaysiaPhone(row.phone);
  const url = normalizeText(row.google_maps_url);
  const dedupeKey = normalizeText(row.dedupe_key);

  const duplicate = (
    (phone && history.phones.has(phone)) ||
    (url && history.urls.has(url)) ||
    (dedupeKey && history.dedupeKeys.has(dedupeKey)) ||
    (phone && localSeen.has(`p:${phone}`)) ||
    (url && localSeen.has(`u:${url}`)) ||
    (dedupeKey && localSeen.has(`k:${dedupeKey}`))
  );
  if (!duplicate) {
    if (phone) localSeen.add(`p:${phone}`);
    if (url) localSeen.add(`u:${url}`);
    if (dedupeKey) localSeen.add(`k:${dedupeKey}`);
  }
  return duplicate;
}

function reviewScore(value) {
  return reviewCountNumber(value);
}

function candidateSort(a, b) {
  const aQuotaRank = [...targetQuotas.keys()].indexOf(a.industry);
  const bQuotaRank = [...targetQuotas.keys()].indexOf(b.industry);
  const aRank = aQuotaRank === -1 ? 999 : aQuotaRank;
  const bRank = bQuotaRank === -1 ? 999 : bQuotaRank;
  if (aRank !== bRank) return aRank - bRank;
  const reviewDiff = reviewScore(b.reviews) - reviewScore(a.reviews);
  if (reviewDiff !== 0) return reviewDiff;
  return a.business_name.localeCompare(b.business_name);
}

function selectWithIndustryMix(candidates, target) {
  const sorted = [...candidates].sort(candidateSort);
  const selected = [];
  const selectedKeys = new Set();
  const counts = new Map();

  const add = (row) => {
    const key = row.dedupe_key;
    if (selectedKeys.has(key)) return false;
    const cap = industryCaps.get(row.industry);
    if (cap && (counts.get(row.industry) ?? 0) >= cap) return false;
    selected.push(row);
    selectedKeys.add(key);
    counts.set(row.industry, (counts.get(row.industry) ?? 0) + 1);
    return true;
  };

  for (const [industry, quota] of targetQuotas.entries()) {
    for (const row of sorted) {
      if (selected.length >= target) break;
      if (row.industry !== industry) continue;
      if ((counts.get(industry) ?? 0) >= quota) break;
      add(row);
    }
  }

  for (const row of sorted) {
    if (selected.length >= target) break;
    const quota = targetQuotas.get(row.industry);
    if (quota && (counts.get(row.industry) ?? 0) >= quota + 8) continue;
    add(row);
  }

  // Final fill: if the preferred industry mix still leaves us short of target,
  // top up with any remaining unique candidate regardless of quota/cap, so a
  // shortfall in one industry is backfilled by others to reach the full target.
  if (selected.length < target) {
    for (const row of sorted) {
      if (selected.length >= target) break;
      const key = row.dedupe_key;
      if (selectedKeys.has(key)) continue;
      selected.push(row);
      selectedKeys.add(key);
      counts.set(row.industry, (counts.get(row.industry) ?? 0) + 1);
    }
  }

  return selected.slice(0, target);
}

function escapeCsv(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function colName(index) {
  let n = index;
  let name = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

function buildCsv(rows) {
  return [
    columns.join(","),
    ...rows.map((row) => columns.map((column) => escapeCsv(row[column])).join(",")),
  ].join("\n") + "\n";
}

async function main() {
  if (process.argv.includes("--profile-info")) {
    console.log(JSON.stringify({
      campaign_id: campaignId,
      source_lane_count: sourceLanes.length,
      target_quotas: Object.fromEntries(targetQuotas),
      sample_message: buildMessage("Example Company", "other business", "", "preview"),
    }, null, 2));
    return;
  }
  await fs.mkdir(userOutputDir, { recursive: true });
  await fs.mkdir(systemOutputDir, { recursive: true });
  const baseName = outputBaseName;

  if (rebuildFromJson) {
    const existing = JSON.parse(await fs.readFile(path.join(userOutputDir, `${baseName}.json`), "utf8"));
    console.log(JSON.stringify({
      output_json: path.join(userOutputDir, `${baseName}.json`),
      final_fresh_count: existing.newLeads.length,
      suppress_count: existing.suppress_count,
      mode: "rebuild-from-json",
    }, null, 2));
    return;
  }

  const history = await loadHistoryKeys();
  const localSeen = new Set();
  const leads = [];
  const laneStats = [];
  let suppressCount = 0;

  const lanesPerRun = Number(process.env.LANES_PER_RUN || "220");
  const sampledLanes = sampleLanes(sourceLanes, lanesPerRun);
  for (const [query, city] of sampledLanes) {
    let parsed = [];
    try {
      parsed = await fetchMapsRows(query, city);
    } catch (error) {
      laneStats.push({ lane: `${query} ${city}`, parsed: 0, accepted: 0, error: error.message });
      await sleep(700);
      continue;
    }

    let accepted = 0;
    for (const row of parsed) {
      if (isExcluded(row)) {
        suppressCount += 1;
        continue;
      }
      if (isHistoricalDuplicate(row, history, localSeen)) {
        suppressCount += 1;
        continue;
      }
      leads.push(row);
      accepted += 1;
    }
    laneStats.push({ lane: `${query} ${city}`, parsed: parsed.length, accepted });
    await sleep(650);
  }

  const prioritized = selectWithIndustryMix(leads, targetCount)
    .map((row, index) => ({
      ...row,
      priority_rank: index + 1,
      suggested_send_batch: `Batch ${Math.floor(index / 10) + 1}`,
    }));

  const payload = {
    campaign_id: campaignId,
    date,
    generated_at: new Date().toISOString(),
    target_count: targetCount,
    final_fresh_count: prioritized.length,
    suppress_count: suppressCount,
    source_lanes: laneStats,
    newLeads: prioritized,
  };

  const jsonText = JSON.stringify(payload, null, 2) + "\n";
  const csvText = buildCsv(prioritized);
  for (const dir of [userOutputDir, systemOutputDir]) {
    await fs.writeFile(path.join(dir, `${baseName}.json`), jsonText);
    await fs.writeFile(path.join(dir, `${baseName}.csv`), csvText);
  }

  console.log(JSON.stringify({
    output_json: path.join(userOutputDir, `${baseName}.json`),
    output_csv: path.join(userOutputDir, `${baseName}.csv`),
    final_fresh_count: prioritized.length,
    suppress_count: suppressCount,
    lanes_used: laneStats.filter((row) => row.accepted > 0).length,
    total_lanes_attempted: laneStats.length,
    whatsapp_ready: prioritized.filter((row) => row.whatsapp_click_to_send_link).length,
    public_phone_only: prioritized.filter((row) => !row.whatsapp_click_to_send_link).length,
  }, null, 2));
}

await main();
