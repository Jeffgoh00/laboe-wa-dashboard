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
  // 苗圃/园艺/殡仪排除保留（2026-07-21 florist/gift lanes 已移出 design，这几条留着防模糊类目漏入无害；
  // 只用 "plant nursery" 不用裸 "nursery"，避免误伤 baby 桶的母婴店名/类目）
  /\bplant nursery\b/i,
  /\blandscap/i,
  /\bgarden cent(re|er)\b/i,
  /\bfuneral (home|parlour|parlor|services)\b/i,
  /\bartificial flower/i,
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
  ["beauty boutique", "Setia Alam"],
  ["skincare boutique", "Ara Damansara"],
  ["local cosmetics store", "Kepong"],
  ["beauty supply store", "Batu Pahat"],
  ["beauty supply store", "Muar"],
  ["beauty cosmetics shop", "Seremban"],
  ["cosmetics store", "Kuantan"],
  ["skincare store", "Sungai Petani"],
  ["beauty product shop", "Bukit Mertajam"],
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
  ["jewellery boutique", "Bangsar"],
  ["jewellery boutique", "Mont Kiara"],
  ["jewelry store", "Bandar Sunway"],
  ["jewellery boutique", "Seremban"],
  ["jewellery boutique", "Kuantan"],
  ["jewellery boutique", "Bukit Mertajam"],
  ["jewellery boutique", "Miri"],
  // —— 2026-07-21 领域切割：florist / gift lanes 全部移出 design，归 celebration campaign 独占 ——
  //    背景：07-17 加回后实测 400 条里 91% 被 florist+gift 占领（老三桶 90 天去重耗干 + Pass 2/3 兜底硬填），
  //    且与 celebration 库存撞出 50 家同店（去重按 campaign 隔离）。回到 07-03 的切法，根除双线撞车。
  //    design 只做 jewelry / baby / beauty 三桶；缺口靠下方城市扩展数组的新关键词变体补池。
  // —— wedding / event / party / balloon lanes 已移除（2026-07-17） ——
  // —— fashion / home / 蛋糕 / 宠物 / 健身 / 手机配件 lanes 已移除（2026-07-06） ——
  // —— 城市扩展 (2026-06-13)：核心行业词 × 新增城市，扩大供给池 ——
  //    2026-07-21：florist/flower shop/gift 系词移出（归 celebration）；三桶各加关键词变体扩池
  //    （老三桶 90 天窗口内枯竭，一天只挤得出 10-25 条，靠新词×城市轮换补供给）。
  ...["Cheras", "Setapak", "Wangsa Maju", "Selayang", "Klang", "Rawang", "Semenyih", "Cyberjaya", "Putrajaya", "Sungai Buloh", "Seri Kembangan", "George Town", "Bayan Lepas", "Butterworth", "Iskandar Puteri", "Kulai", "Skudai", "Ipoh"]
    .flatMap((city) => ["beauty cosmetics shop", "skincare store", "cosmetics store", "makeup store", "baby product store", "baby shop", "kids boutique", "children toy store", "maternity store", "jewellery boutique", "jewelry store"].map((q) => [q, city])),
  // —— 城市扩展 #2 (2026-06-13)：填补空白州 + 加厚 ——
  ...["Bukit Bintang", "KLCC", "Sentul", "Sri Hartamas", "Desa ParkCity", "Brickfields", "Old Klang Road", "Sungai Besi", "Bandar Kinrara", "USJ", "Kota Kemuning", "Bangi", "Batu Caves", "Gombak", "Banting", "Tanjung Tokong", "Gelugor", "Air Itam", "Seberang Jaya", "Bukit Indah", "Permas Jaya", "Pasir Gudang", "Senai", "Kluang", "Segamat", "Pontian", "Sitiawan", "Teluk Intan", "Kampar", "Alor Setar", "Bentong", "Temerloh", "Nilai", "Port Dickson", "Ayer Keroh", "Kota Kinabalu", "Penampang", "Sandakan", "Kuching", "Bintulu", "Kota Bharu", "Kuala Terengganu", "Kangar"]
    .flatMap((city) => ["beauty cosmetics shop", "skincare store", "cosmetics store", "makeup store", "baby product store", "baby shop", "kids boutique", "children toy store", "maternity store", "jewellery boutique", "jewelry store"].map((q) => [q, city])),
];

// Order = priority (drives candidateSort rank + fill order). 2026-07-21：florist / gift 两桶移出
// design（归 celebration 独占，根除双线撞车），回到三桶：Jewelry / Baby / Beauty·Skincare·Cosmetics。
// ⚠️ 老三桶 90 天窗口内已近枯竭，短期内单日可能凑不满 100（每桶实际产出以真跑为准）；
//    已加关键词变体扩池，且 6 月中采的 leads 9 月中滚出 90 天窗口后自动回池。
const designTargetQuotas = new Map([
  ["jewelry", 34],
  ["maternity / baby / kids product", 33],
  ["beauty / skincare / cosmetics", 33],
]);

// 严格只要上面 3 类：designSourceLanes 已剪枝成只含这 3 类的搜索词，industryFrom 靠 queryText 判定
// 且这 3 类的判定规则都排在 fashion/home/restaurant 等之前 → 候选池 ~100% 落在这 3 类。
// florist / gift 若经模糊类目漏入会被归到无 quota 桶（rank 999 垫底），仅 Pass 2/3 缺口时才可能进 —
// 采集词已全移除，实际漏入量应≈0。
const designIndustryCaps = new Map();

// —— Florist(=Celebration) campaign (2026-07-17 聚焦 florist + gift)：花店 7 词 + 礼品 3 词，其余管线与 design 一致 ——
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
  // 2026-07-17 聚焦 florist + gift 两类（蛋糕/气球 2026-07-10 已移除；库存旧 leads 不动，纯 forward）
  "florist", "flower shop", "flower delivery", "florist gift shop", "wedding florist", "online florist", "kedai bunga",
  "gift shop", "gift hamper shop", "hamper gift delivery",
];

const floristSourceLanes = floristCities.flatMap((city) => floristQueries.map((query) => [query, city]));

// 花店零售门店，只排明显不是零售门店的（nursery/苗圃/批发/制造/假花厂等）
const floristExcludePatterns = [
  /\bnursery\b/i,
  /\blandscap/i,
  /\bgarden cent(re|er)\b/i,
  /\bhardware\b/i,
  /\bfuneral (home|parlour|parlor|services)\b/i,
  /\bwholesale\b/i,
  /\bingredient supplier\b/i,
  /\bmanufactur/i,            // manufacturer / manufacturing = B2B，非零售
  /\bartificial flower/i,     // 假花厂/批发，非消费花店
];

// florist 50 + gift 50（2026-07-17）
const floristTargetQuotas = new Map([
  ["florist / flowers", 50],
  ["gift / hamper", 50],
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
  "lead_score",
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

// —— Lead scoring (方向 A：没网站/弱网站 = 高分，因为有好网站的不需要我们的简单网站) ——
// 权重集中在这里，一处可调。与 DB backfill SQL 同源，改这里也要同步 SQL/门户。
const WEAK_SITE_RE = /(facebook|fb\.com|instagram|tiktok|linktr|wa\.me|whatsapp\.com|shopee|lazada|carousell|beacons\.ai|blogspot|wixsite|\.wix\.com|weebly|wordpress\.com|business\.site|godaddysites|sites\.google\.com|mystrikingly|webnode|jimdo|square\.site)/i;
function scoreLead({ website, phone, reviews, rating, openEvidence }) {
  const url = String(website ?? "").trim();
  let s = url === "" ? 40 : WEAK_SITE_RE.test(url) ? 28 : 0;           // 无在线 / 弱站 / 真站
  s += /^601\d{7,}/.test(String(phone ?? "").replace(/\D/g, "")) ? 15 : -25; // 可 WhatsApp
  const r = reviewCountNumber(reviews);
  s += r === 0 ? 0 : r <= 10 ? 8 : r <= 50 ? 15 : r <= 200 ? 18 : 14;  // 真实度/付费力
  const rt = Number(rating) || 0;
  s += rt >= 4.0 ? 10 : rt >= 3.0 ? 5 : 0;                             // 口碑
  s += /permanently closed/i.test(String(openEvidence ?? "")) ? -30 : 10; // 活跃
  return Math.max(0, Math.min(100, s));
}
function gradeFromScore(s) { return s >= 85 ? "A" : s >= 55 ? "B" : "C"; }

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
  // florist(=Celebration) campaign 采 florist + gift 两桶(2026-07-17)。花店词优先判定：
  // "florist gift shop" / 花店挂 Gift shop 类目 → 归花店桶，纯 gift/hamper 词才归礼品桶。
  if (campaignId === "florist") {
    return /florist|flower|bouquet|bunga/.test(text) ? "florist / flowers" : "gift / hamper";
  }
  // 目标桶先判：类目常混带 wedding/party 等词（如 "Wedding jewelry"、"Party supply"），
  // 目标桶判定必须排在 event 等 legacy 兜底之前，否则候选掉进无 quota 的桶被降权。
  // 2026-07-21 起 design 只有 jewelry/baby/beauty 三桶有 quota；florist/gift 判定保留但已无 quota
  // （rank 999 垫底，采集词也已移除）——florist 先判防花店混进 jewelry，gift 放最后防
  // 珠宝/玩具/美妆店的 "Gift shop" 副类目被错吸进 gift 桶。
  if (/florist|flower|bouquet/.test(text)) return "florist / flowers";
  if (/jewel|jewelry|jewellery/.test(text)) return "jewelry";
  if (/cosmetic|beauty|skincare|skin care|makeup/.test(text)) return "beauty / skincare / cosmetics";
  if (/maternity|pregnan|mother|baby|kids|children|child|toy|learning toy/.test(text)) return "maternity / baby / kids product";
  if (/\bgift\b|hamper/.test(text)) return "gift / hamper";
  if (/wedding|event|party|balloon/.test(text)) return "event / wedding / party / gifting";
  if (/\bpet\b|pet shop|pet supply|pet supplies|pet food|pet bakery|pet grooming|\bgrooming\b/.test(text)) return "pet / lifestyle services";
  if (/pilates|yoga|dance|fitness|gym|studio/.test(text)) return "fitness / studio";
  if (/fashion|boutique|clothing|women|apparel|shoe|bag/.test(text)) return "fashion / apparel / boutique";
  if (/home|decor|furniture|living/.test(text)) return "home / living / decor";
  if (/electronic|gadget|mobile|accessor/.test(text)) return "electronics / gadgets";
  if (/bakery|cake|cafe|dessert|restaurant|coffee/.test(text)) return "restaurant / cafe / bakery";
  return "other visual-driven SME";
}

function buildAngle(industry, name) {
  if (campaignId === "florist") {
    return `${name} takes most orders through scattered WhatsApp and social DMs, so a simple online catalogue with one-tap WhatsApp ordering could make busy and festive days far easier to manage.`;
  }
  if (industry === "beauty / skincare / cosmetics") {
    return `${name} already has a product-led retail presence, and stronger product visuals, launch creatives, and short-form social content could make the brand look more premium online.`;
  }
  if (industry === "florist / flowers") {
    return `${name} sells highly visual products, so seasonal campaign graphics, bouquet photography, and clearer promo creatives could help convert more casual browsers.`;
  }
  if (industry === "gift / hamper") {
    return `${name} sells gifting products where presentation drives the sale, so sharper hamper/gift photography, seasonal campaign visuals, and cleaner promo creatives could help convert more browsers.`;
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
  if (industry === "jewelry") {
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
  if (campaignId === "florist") return "Orders come in over scattered WhatsApp/IG chats; a one-page catalogue with one-tap WhatsApp ordering would tidy that up.";
  if (industry === "restaurant / cafe / bakery") return "Food/product visuals and promo content need to look appetizing and consistent across Maps/social.";
  if (industry === "beauty / skincare / cosmetics") return "Product and retail visuals need a more premium, campaign-ready look.";
  if (industry === "home / living / decor") return "Catalog and lifestyle visuals need clearer styling to show product value.";
  if (industry === "fashion / apparel / boutique") return "New-arrival and lookbook content needs more consistent visual direction.";
  if (industry === "maternity / baby / kids product") return "Parent-facing product visuals need clear trust cues, friendly packaging, and polished social content.";
  if (industry === "florist / flowers") return "Seasonal/bouquet content needs strong photos, layout, and promo graphics.";
  if (industry === "gift / hamper") return "Gift/seasonal content needs strong photos, layout, and promo graphics.";
  if (industry === "jewelry") return "Detail product shots and premium social layouts can be stronger.";
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

// —— Florist(=Celebration)campaign 开场白(2026-07-03 简化版)——
// 卖点 = 专门给这类店做的「产品展示 + 客户自助集单一次发 WhatsApp」下单页,省店主逐条回复客户的时间(Hanna Flower 那套)。
// 简版·马来西亚口味:3 段短句、平白用词、社会证明基调。一套 12 条按 industry vocab 自适应(花店 flowers/flower shop、蛋糕 cakes/cake shop、气球 balloons/party shop)。
// {{SENDER}}/{{COMPANY}} 门户渲染时替换,店名烘进,\n\n 分段,stableIndex 轮替(措辞打散降批量判垃圾)。
const CELEBRATION_VOCAB = {
  "florist / flowers": { product: "flowers", niche: "florists", shop: "flower shop" },
  "gift / hamper": { product: "gifts and hampers", niche: "gift shops", shop: "gift shop" },
  "cake / bakery": { product: "cakes", niche: "cake shops", shop: "cake shop" },
  "balloon / party": { product: "balloons", niche: "party shops", shop: "party shop" },
};

const floristMessageFrameworks = [
  (name, v) =>
    `Hi ${name} 👋 {{SENDER}} here from {{COMPANY}}.\n\n` +
    `We specially built an online order page for ${v.niche} — it shows all your ${v.product} nicely, and customers can pick what they want and send the full order to your WhatsApp in one message.\n\n` +
    `So you reply less and save time. We've got one live for a local ${v.shop} — want the link to see?`,
  (name, v) =>
    `Hi 👋 this is {{SENDER}} from {{COMPANY}}.\n\n` +
    `We made a simple page just for ${v.niche}: your ${v.product} all displayed, and customers tick what they want — it comes to your WhatsApp as one neat order.\n\n` +
    `Less answering one by one for you. We've done one for a real ${v.shop} already — okay if I send you the example?`,
  (name, v) =>
    `Hi ${name} 👋 {{SENDER}} from {{COMPANY}}.\n\n` +
    `We built a page specially for ${v.niche} — customers see all your ${v.product}, choose, and the whole order goes straight to your WhatsApp on its own.\n\n` +
    `Saves you a lot of back-and-forth replying. Here's one we made for a local ${v.shop} — want me to send it over?`,
  (name, v) =>
    `Hi there 👋 this is {{SENDER}} from {{COMPANY}}.\n\n` +
    `We set up simple online order pages for ${v.niche} — all your ${v.product} on display, and customers add what they like and send you the full order on WhatsApp in one go.\n\n` +
    `So you don't reply to every message one by one. We already made one for a local ${v.shop} — can I send you the link?`,
  (name, v) =>
    `Good day 👋 {{SENDER}} here from {{COMPANY}}.\n\n` +
    `We specially made an online page for ${v.niche} — it shows all your ${v.product}, and customers pick and send their whole order to your WhatsApp by themselves.\n\n` +
    `Much less time replying for you. Got one running for a real ${v.shop} — want to have a look?`,
  (name, v) =>
    `Hi ${name} 👋 {{SENDER}} from {{COMPANY}}.\n\n` +
    `We help ${v.niche} with a simple order page — your ${v.product} all shown nicely, and customers choose and send the full order straight to your WhatsApp.\n\n` +
    `So you spend less time answering one by one. We've got one live for a ${v.shop} already — okay if I share it?`,
  (name, v) =>
    `Hi 👋 this is {{SENDER}} from {{COMPANY}}.\n\n` +
    `We built something specially for ${v.niche}: one page that displays all your ${v.product}, where customers tick what they want and it arrives to your WhatsApp as one complete order.\n\n` +
    `Less back-and-forth for you. Here's one we did for a local ${v.shop} — want the link?`,
  (name, v) =>
    `Hi ${name} 👋 {{SENDER}} here from {{COMPANY}}.\n\n` +
    `We made a simple online order page for ${v.niche} — customers see all your ${v.product} with prices, pick what they want, and send the whole order to your WhatsApp in one message.\n\n` +
    `So you don't have to reply to each one. We've done one for a real ${v.shop} — can I send it over?`,
  (name, v) =>
    `Good day 👋 this is {{SENDER}} from {{COMPANY}}.\n\n` +
    `We set up an online page just for ${v.niche} — your ${v.product} all displayed, customers choose on their own and the full order comes to your WhatsApp automatically.\n\n` +
    `Saves you a lot of replying time. Got one live for a local ${v.shop} — want to see?`,
  (name, v) =>
    `Hi ${name} 👋 {{SENDER}} from {{COMPANY}}.\n\n` +
    `We specially built an order page for ${v.niche} — shows all your ${v.product}, and customers put together their whole order and send it to your WhatsApp in one go.\n\n` +
    `So you reply far less. We already set one up for a ${v.shop} — okay if I send you the example?`,
  (name, v) =>
    `Hi there 👋 {{SENDER}} here from {{COMPANY}}.\n\n` +
    `We made a simple page for ${v.niche} that shows all your ${v.product}, and lets customers pick and send their full order to your WhatsApp themselves.\n\n` +
    `Less time answering customers one by one. Here's one we built for a local ${v.shop} — want me to send it?`,
  (name, v) =>
    `Hi 👋 this is {{SENDER}} from {{COMPANY}}.\n\n` +
    `We built an online order page specially for ${v.niche} — all your ${v.product} on show, customers choose and it comes to your WhatsApp as one neat order.\n\n` +
    `So you spend less time on replies. We've got one live for a real ${v.shop} — want the link to have a look?`,
];

// design 用 messageFrameworks;florist campaign 用 floristMessageFrameworks + 按 industry 取 vocab(花店/蛋糕/气球自适应)。
function buildMessage(name, industry, angle, seed = "") {
  if (campaignId === "florist") {
    const v = CELEBRATION_VOCAB[industry] || CELEBRATION_VOCAB["florist / flowers"];
    const idx = stableIndex(`framework|${seed}|${name}`, floristMessageFrameworks.length);
    return floristMessageFrameworks[idx](name, v);
  }
  const idx = stableIndex(`framework|${seed}|${name}`, messageFrameworks.length);
  return messageFrameworks[idx](name);
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
      const openEvidence = findOpenStatus(arr);
      const leadScore = scoreLead({ website, phone: normalizedPhone, reviews, rating, openEvidence });
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
        active_or_public_evidence: openEvidence,
        observed_design_need: buildObservedNeed(industry),
        recommended_angle: angle,
        suggested_opening_message: message,
        lead_grade: gradeFromScore(leadScore),
        lead_score: leadScore,
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
