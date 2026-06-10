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
const rebuildFromJson = process.argv.includes("--from-json");
const outputBaseName = `${date}-google-maps-fresh-leads`;

const excludePatterns = [
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

const sourceLanes = [
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
  ["florist gift shop", "Ampang"],
  ["florist gift shop", "Mont Kiara"],
  ["flower delivery", "Bangsar"],
  ["florist gift shop", "Seremban"],
  ["florist gift shop", "Kuantan"],
];

const targetQuotas = new Map([
  ["beauty / skincare / cosmetics", 25],
  ["fashion / apparel / boutique", 18],
  ["maternity / baby / kids product", 15],
  ["home / living / decor", 20],
  ["jewelry / watches / accessories", 15],
  ["event / wedding / party / gifting", 7],
]);

const industryCaps = new Map([
  ["restaurant / cafe / bakery", 3],
  ["florist / gifting / lifestyle retail", 5],
  ["electronics / gadgets", 5],
  ["pet / lifestyle services", 2],
  ["fitness / studio", 2],
  ["other visual-driven SME", 5],
]);

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
  return /^601\d{8,9}$/.test(digits) || /^65[689]\d{7}$/.test(digits);
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

function shortIndustry(industry) {
  if (industry.includes("maternity") || industry.includes("baby") || industry.includes("kids")) return "parent/kids product";
  if (industry.includes("pet")) return "pet/lifestyle";
  if (industry.includes("beauty")) return "beauty/skincare";
  if (industry.includes("florist")) return "gifting/florist";
  if (industry.includes("fashion")) return "fashion retail";
  if (industry.includes("restaurant") || industry.includes("cafe") || industry.includes("bakery")) return "food and beverage";
  if (industry.includes("event") || industry.includes("wedding")) return "event/gifting";
  return "business";
}

function buildMessage(name, industry, angle, seed = "") {
  const type = shortIndustry(industry);
  const templates = [
    `Hi ${name}, Jeff here from Laboe Studio. I came across your ${type} brand and thought the visuals could be made stronger for social posts, promos, and product presentation. If useful, I can send over a few relevant samples first.`,
    `Hello ${name}, this is Jeff from Laboe Studio. I noticed your ${type} listing and felt there may be room to make the brand visuals cleaner and more campaign-ready. I can share a few sample directions if you are open to it.`,
    `Hi, I’m Jeff from Laboe Studio. Saw ${name} and liked the business category you are in. We help brands improve product visuals, social content, and promo creatives. Would it be okay if I send a few examples?`,
    `Hi ${name}, Jeff from Laboe Studio here. Your business seems quite visual, so stronger social/product creatives could help customers understand the offer faster. Happy to send a few sample works first if helpful.`,
    `Hello, I’m Jeff from Laboe Studio. I found ${name} while looking at local ${type} businesses. I think there are some simple ways to improve the visual direction for posts, promos, and customer enquiries. Can I share a few examples?`,
    `Hi ${name}, reaching out from Laboe Studio. We work on brand visuals, product content, and campaign creatives. I thought your ${type} business could be a good fit for this. I can send references first, no hard pitch.`,
    `你好 ${name}，我是 Jeff，来自 Laboe Studio。看到你们的业务后觉得产品/社媒/活动视觉还有机会做得更清楚、更吸引人。如果方便，我可以先发几个相关案例给你看。`,
    `你好，我是 Laboe Studio 的 Jeff。刚看到 ${name}，觉得你们这种 ${type} 业务很适合加强产品图、社媒内容和促销视觉。你愿意的话我可以先发一些参考案例。`,
  ];
  return templates[stableIndex(`${seed}|${name}|${industry}`, templates.length)];
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
        country: "Malaysia",
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
  const registry = JSON.parse(await fs.readFile(registryPath, "utf8"));
  const keys = {
    phones: new Set([...(registry.contactedPhones ?? []), ...(registry.blockedPhones ?? []), ...(registry.interestedPhones ?? [])].map(normalizeMalaysiaPhone)),
    brands: new Set([...(registry.contactedBrands ?? []), ...(registry.blockedBrands ?? [])].map(normalizeText)),
    urls: new Set(),
    websites: new Set(),
    addresses: new Set(),
    dedupeKeys: new Set(),
  };

  const outputFiles = await fs.readdir(systemOutputDir);
  for (const file of outputFiles.filter((name) => name.endsWith(".json"))) {
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

function isHistoricalDuplicate(row, history, localSeen) {
  const phone = normalizeMalaysiaPhone(row.phone);
  const brand = normalizeText(row.business_name);
  const url = normalizeText(row.google_maps_url);
  const website = normalizeText(row.website_or_social_url);
  const address = normalizeText(row.address);
  const dedupeKey = normalizeText(row.dedupe_key);
  const localKey = `${brand}|${phone}|${address}`;

  const duplicate = (
    history.phones.has(phone) ||
    history.brands.has(brand) ||
    history.urls.has(url) ||
    (website && history.websites.has(website)) ||
    (address && history.addresses.has(address)) ||
    history.dedupeKeys.has(dedupeKey) ||
    localSeen.has(localKey) ||
    localSeen.has(phone) ||
    localSeen.has(brand)
  );
  if (!duplicate) {
    localSeen.add(localKey);
    localSeen.add(phone);
    localSeen.add(brand);
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

  for (const [query, city] of sourceLanes) {
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
