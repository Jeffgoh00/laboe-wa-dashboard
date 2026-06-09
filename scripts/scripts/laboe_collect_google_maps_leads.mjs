import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const leadSystemDir = process.cwd();
const userOutputDir = path.join(leadSystemDir, "lead_outputs");
const systemOutputDir = path.join(leadSystemDir, "lead_outputs");
const registryPath = path.join(leadSystemDir, "data", "contact_registry.json");
const date = process.argv[2] ?? new Date().toISOString().slice(0, 10);
const targetCount = Number(process.argv[3] ?? "100");
const rebuildFromJson = process.argv.includes("--from-json");
const outputBaseName = `-google-maps-fresh-leads`;

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
