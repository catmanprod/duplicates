const CORE_COLS = ["[uuid]", "SKU", "Штрихкод", "Бренд", "Variation_name", "Вендор код", "Назва"];
const COLOR_WORDS = [
  "black", "white", "silver", "gray", "grey", "blue", "red", "green", "yellow", "purple", "pink",
  "gold", "orange", "beige", "brown", "bronze", "graphite", "space gray", "midnight", "starlight",
  "чорний", "білий", "сріблястий", "сірий", "синій", "червоний", "зелений", "жовтий", "фіолетовий",
  "рожевий", "золотий", "помаранчевий", "бежевий", "коричневий", "графіт", "чорна", "біла", "срібна"
];
const MEMORY_TYPES = ["ddr3", "ddr4", "ddr5", "lpddr4", "lpddr5", "gddr6", "gddr6x"];
const STORAGE_TYPES = ["ssd", "hdd", "nvme", "sata", "pcie", "ufs", "emmc", "microsd", "sdxc"];
const UNIVERSAL_PROFILE = {
  mustMatchText: [
    "iphone", "samsung", "xiaomi", "pixel", "redmi", "realme", "oneplus", "motorola",
    "матрац", "матрас", "mattress", "ортопедичний", "пружинний", "безпружинний",
    "cat", "dog", "кіт", "собака", "puppy", "kitten", "стерилізован"
  ],
  conflictText: [
    ["dual sim", "single sim"],
    ["e-sim", "nano sim"],
    ["new", "refurbished"],
    ["пружинний", "безпружинний"],
    ["foam", "spring"],
    ["cat", "dog"],
    ["кіт", "собак"],
    ["puppy", "adult"],
    ["kitten", "adult"]
  ],
  extraPatterns: [
    { key: "cameraMp", regex: /(?:^|[^\d])(\d{2,3})\s*mp\b/gi },
    { key: "batteryMah", regex: /(?:^|[^\d])(\d{3,5})\s*mah\b/gi },
    { key: "mattressTripleSize", regex: /\b(\d{2,3}\s*(?:x|×)\s*\d{2,3}\s*(?:x|×)\s*\d{1,3})\b/gi },
    { key: "heightCm", regex: /(?:^|[^\d])(\d{1,3})\s*см\b/gi },
    { key: "weightKg", regex: /(?:^|[^\d])(\d{1,2}(?:\.\d{1,2})?)\s*kg\b/gi },
    { key: "weightG", regex: /(?:^|[^\d])(\d{2,5})\s*g\b/gi }
  ]
};

const state = {
  inputRows: [],
  resultRows: []
};

const fileInput = document.getElementById("fileInput");
const runBtn = document.getElementById("runBtn");
const exportBtn = document.getElementById("exportBtn");
const statusEl = document.getElementById("status");
const tableEl = document.getElementById("resultTable");

fileInput.addEventListener("change", onLoadFile);
runBtn.addEventListener("click", onRun);
exportBtn.addEventListener("click", onExport);
window.addEventListener("error", (event) => {
  setStatus(`Помилка JS: ${event.message}`);
});

function setStatus(msg) {
  statusEl.textContent = msg;
}

function normText(value) {
  if (value == null) return "";
  let s = String(value).trim().toLowerCase().replace(/\s+/g, " ");
  const noise = [
    "official", "гарантія", "новинка", "new"
  ];
  for (const w of noise) s = s.replaceAll(w, " ");
  s = s.replace(/[^\p{L}\p{N}\s_]/gu, " ").replace(/\s+/g, " ").trim();
  return s;
}

function normVendor(value) {
  if (value == null) return "";
  return String(value).trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function normBarcode(value) {
  if (value == null) return "";
  return String(value).replace(/\D+/g, "");
}

function extractCodesFromTitle(title) {
  const t = String(title || "").toUpperCase();
  const barcodes = [...new Set(t.match(/\b\d{8,14}\b/g) || [])];
  const raw = t.match(/\b[A-Z0-9][A-Z0-9\-_/\.]{3,}[A-Z0-9]\b/g) || [];
  const tokens = t.match(/[A-Z0-9]+/g) || [];
  const joined = [];
  for (let i = 0; i < tokens.length - 1; i++) {
    const comb = tokens[i] + tokens[i + 1];
    if (comb.length >= 5 && comb.length <= 20 && /[A-Z]/.test(comb) && /\d/.test(comb)) {
      joined.push(comb);
    }
  }

  const vendorCodes = [];
  for (const c of [...raw, ...joined]) {
    const nv = normVendor(c);
    if (nv.length >= 5 && /[A-Z]/.test(nv) && /\d/.test(nv)) vendorCodes.push(nv);
  }
  return [[...new Set(vendorCodes)], barcodes];
}

function extractBracketVendorCodes(title) {
  const s = String(title || "");
  const out = new Set();
  const matches = s.match(/\(([^)]+)\)/g) || [];
  for (const m of matches) {
    const inner = m.slice(1, -1).trim();
    const nv = normVendor(inner);
    if (nv.length >= 5 && /[A-Z]/.test(nv) && /\d/.test(nv)) {
      out.add(nv);
    }
  }
  return out;
}

function tokenSetRatio(a, b) {
  const aTokens = new Set(normText(a).split(" ").filter(Boolean));
  const bTokens = new Set(normText(b).split(" ").filter(Boolean));
  if (!aTokens.size || !bTokens.size) return 0;
  let intersect = 0;
  for (const t of aTokens) if (bTokens.has(t)) intersect++;
  return (2 * intersect) / (aTokens.size + bTokens.size);
}

function extractNumericValues(regex, input) {
  const re = new RegExp(regex.source, regex.flags);
  const out = new Set();
  let m;
  while ((m = re.exec(input)) !== null) out.add(m[1]);
  return out;
}

function extractDimensionPairs(input) {
  const out = new Set();
  const regex = /(?:^|[^\d])(\d{2,3})\s*[xх×]\s*(\d{2,3})(?:\s*(?:см|cm))?/gi;
  let m;
  while ((m = regex.exec(input)) !== null) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    const [minD, maxD] = a <= b ? [a, b] : [b, a];
    out.add(`${minD}x${maxD}`);
  }
  return out;
}

function detectColors(raw) {
  const s = String(raw || "").toLowerCase();
  const found = new Set();
  for (const c of COLOR_WORDS) {
    if (s.includes(c)) found.add(c);
  }
  return found;
}

function parseTitleAttributes(title) {
  const normalized = normText(title);
  const raw = String(title || "");
  const lower = raw.toLowerCase();
  const profile = UNIVERSAL_PROFILE;

  const attrs = {
    mustText: new Set(),
    conflictText: new Set(),
    extra: {},
    colors: detectColors(raw),
    bracketVendorCodes: extractBracketVendorCodes(raw),
    memoryType: MEMORY_TYPES.find((x) => lower.includes(x)) || "",
    storageType: STORAGE_TYPES.find((x) => lower.includes(x)) || "",
    capacitiesGb: extractNumericValues(/(?:^|[^\d])(\d{1,4})\s*gb\b/gi, lower),
    capacitiesTb: extractNumericValues(/(?:^|[^\d])(\d{1,3})\s*tb\b/gi, lower),
    weightsGram: extractNumericValues(/(?:^|[^\d])(\d{2,5})\s*(?:g|гр|gram|grams)\b/gi, lower),
    dimensionsCm: extractDimensionPairs(lower),
    sizesInch: extractNumericValues(/(?:^|[^\d])(\d{1,2}(?:\.\d{1,2})?)\s*(?:\"|inch|in|дюйм)/gi, lower),
    multipliers: extractNumericValues(/\b(\d{1,2})\s*x\s*\d{1,4}\s*gb\b/gi, lower),
    normTitle: normalized
  };

  for (const token of profile.mustMatchText) {
    if (lower.includes(token)) attrs.mustText.add(token);
  }
  for (const [left, right] of profile.conflictText) {
    if (lower.includes(left)) attrs.conflictText.add(left);
    if (lower.includes(right)) attrs.conflictText.add(right);
  }
  for (const p of profile.extraPatterns) {
    attrs.extra[p.key] = extractNumericValues(p.regex, lower);
  }

  return attrs;
}

function setsConflict(left, right) {
  if (!left.size || !right.size) return false;
  for (const x of left) if (right.has(x)) return false;
  return true;
}

function hasHardConflict(a, b) {
  if (setsConflict(a.bracketVendorCodes || new Set(), b.bracketVendorCodes || new Set())) return true;
  if (a.memoryType && b.memoryType && a.memoryType !== b.memoryType) return true;
  if (a.storageType && b.storageType && a.storageType !== b.storageType) return true;
  if (setsConflict(a.capacitiesGb, b.capacitiesGb)) return true;
  if (setsConflict(a.capacitiesTb, b.capacitiesTb)) return true;
  if (setsConflict(a.weightsGram, b.weightsGram)) return true;
  if (setsConflict(a.dimensionsCm, b.dimensionsCm)) return true;
  if (setsConflict(a.sizesInch, b.sizesInch)) return true;
  if (setsConflict(a.multipliers, b.multipliers)) return true;

  // Colors are soft-conflict: block only when both titles are detailed and fully disjoint.
  if (a.colors.size && b.colors.size) {
    const titleRich = a.normTitle.length >= 12 && b.normTitle.length >= 12;
    if (titleRich && setsConflict(a.colors, b.colors)) return true;
  }

  if (a.mustText.size && b.mustText.size && setsConflict(a.mustText, b.mustText)) return true;
  for (const key of Object.keys(a.extra || {})) {
    if (setsConflict(a.extra[key], (b.extra || {})[key] || new Set())) return true;
  }
  const pairConflicts = UNIVERSAL_PROFILE.conflictText || [];
  for (const [left, right] of pairConflicts) {
    const aHasLeft = a.conflictText.has(left);
    const aHasRight = a.conflictText.has(right);
    const bHasLeft = b.conflictText.has(left);
    const bHasRight = b.conflictText.has(right);
    if ((aHasLeft && bHasRight) || (aHasRight && bHasLeft)) return true;
  }

  return false;
}

function titlesLookCompatible(a, b) {
  if (!a.normTitle || !b.normTitle) return true;
  const score = tokenSetRatio(a.normTitle, b.normTitle);
  return score >= 0.42;
}

function ensureColumns(rows) {
  return rows.map((row, idx) => {
    const r = { ...row };

    const normalized = {
      "[uuid]": getByHeader(r, ["[uuid]", "uuid"]),
      "SKU": getByHeader(r, ["SKU"]),
      "Штрихкод": getByHeader(r, ["Штрихкод", "EAN", "Barcode"]),
      "Бренд": getByHeader(r, ["Бренд", "Brand"]),
      "Variation_name": getByHeader(r, ["Variation_name", "Variation", "variation_name"]),
      "Вендор код": getByHeader(r, ["Вендор код", "Vendor code", "Vendor"]),
      "Назва": getByHeader(r, ["Назва", "Название", "Name", "Product name", "Title"])
    };

    for (const c of CORE_COLS) {
      r[c] = normalized[c] ?? "";
    }

    if (!r["[uuid]"]) r["[uuid]"] = `row-${idx + 1}`;
    return r;
  });
}

class DSU {
  constructor() {
    this.parent = new Map();
    this.rank = new Map();
  }

  find(x) {
    if (!this.parent.has(x)) {
      this.parent.set(x, x);
      this.rank.set(x, 0);
    }
    if (this.parent.get(x) !== x) {
      this.parent.set(x, this.find(this.parent.get(x)));
    }
    return this.parent.get(x);
  }

  union(a, b) {
    let ra = this.find(a);
    let rb = this.find(b);
    if (ra === rb) return;
    if (this.rank.get(ra) < this.rank.get(rb)) [ra, rb] = [rb, ra];
    this.parent.set(rb, ra);
    if (this.rank.get(ra) === this.rank.get(rb)) this.rank.set(ra, this.rank.get(ra) + 1);
  }
}

function buildGroups(rows, cfg) {
  const data = ensureColumns(rows).map((r) => {
    const matchTitle = String(r["Variation_name"] || "").trim();
    const [titleVendorCodes, titleBarcodes] = extractCodesFromTitle(matchTitle);
    return {
      ...r,
      _uuid: String(r["[uuid]"]),
      _brand: normText(r["Бренд"]),
      _title: normText(matchTitle),
      _attrs: parseTitleAttributes(matchTitle),
      _vendor: normVendor(r["Вендор код"]),
      _barcode: normBarcode(r["Штрихкод"]),
      _titleVendorCodes: titleVendorCodes,
      _titleBarcodes: titleBarcodes
    };
  });
  // DEBUG: log first 5 normalized titles to console
  console.log("[dedupe] first 5 _title values:", data.slice(0, 5).map(r => JSON.stringify(r._title)));
  console.log("[headers]", Object.keys(rows[0] || {}));
  console.log("[first row raw]", rows[0]);

  const byUuid = new Map(data.map((r) => [r._uuid, r]));

  const edges = new Map();
  const addEdge = (u1, u2, score, reason) => {
    if (u1 === u2) return;
    const left = byUuid.get(u1);
    const right = byUuid.get(u2);
    if (!left || !right) return;
    // For near-identical titles (score >= 0.95) skip hard-conflict check —
    // noisy numeric regexes can produce false conflicts on identical product names.
    if (hasHardConflict(left._attrs, right._attrs)) return;
    if ((reason === "exact_vendor_code" || reason === "exact_barcode") && !titlesLookCompatible(left._attrs, right._attrs)) {
      return;
    }
    const [a, b] = u1 < u2 ? [u1, u2] : [u2, u1];
    const key = `${a}||${b}`;
    if (!edges.has(key) || edges.get(key).score < score) edges.set(key, { a, b, score, reason });
  };

  const byVendor = new Map();
  const byBarcode = new Map();

  for (const row of data) {
    if (row._vendor) {
      if (!byVendor.has(row._vendor)) byVendor.set(row._vendor, []);
      byVendor.get(row._vendor).push(row._uuid);
    }
    if (row._barcode) {
      if (!byBarcode.has(row._barcode)) byBarcode.set(row._barcode, []);
      byBarcode.get(row._barcode).push(row._uuid);
    }
  }

  for (const uuids of byVendor.values()) {
    for (let i = 0; i < uuids.length; i++) for (let j = i + 1; j < uuids.length; j++) addEdge(uuids[i], uuids[j], 1, "exact_vendor_code");
  }

  for (const uuids of byBarcode.values()) {
    for (let i = 0; i < uuids.length; i++) for (let j = i + 1; j < uuids.length; j++) addEdge(uuids[i], uuids[j], 1, "exact_barcode");
  }

  for (const row of data) {
    for (const vc of row._titleVendorCodes) {
      const list = byVendor.get(vc) || [];
      for (const other of list) addEdge(row._uuid, other, 0.98, "vendor_code_in_title");
    }
    for (const bc of row._titleBarcodes) {
      const list = byBarcode.get(bc) || [];
      for (const other of list) addEdge(row._uuid, other, 0.98, "barcode_in_title");
    }
  }

  // Level 3: title_almost_exact — runs for ALL rows regardless of vendor/barcode
  const titleBlocks = new Map();
  for (const row of data) {
    if (!row._title) continue;
    const block = row._title.slice(0, 18);
    if (!titleBlocks.has(block)) titleBlocks.set(block, []);
    titleBlocks.get(block).push(row);
  }
  for (const group of titleBlocks.values()) {
    if (group.length < 2 || group.length > cfg.fuzzyBlockMax) continue;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i];
        const b = group[j];
        const titleScore = tokenSetRatio(a._title, b._title);
        if (titleScore >= 0.95) {
          const bonus = a._brand && a._brand === b._brand ? 0.03 : 0;
          addEdge(a._uuid, b._uuid, Math.min(1, titleScore + bonus), "title_almost_exact");
        }
      }
    }
  }

  // Cross-block fallback: compare all pairs whose titles share the first 8 normalized chars.
  // Catches cases where noise removal shifts the 18-char block boundary.
  const shortBlocks = new Map();
  for (const row of data) {
    if (!row._title) continue;
    const block = row._title.slice(0, 8);
    if (!shortBlocks.has(block)) shortBlocks.set(block, []);
    shortBlocks.get(block).push(row);
  }
  for (const group of shortBlocks.values()) {
    if (group.length < 2 || group.length > cfg.fuzzyBlockMax) continue;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i];
        const b = group[j];
        const titleScore = tokenSetRatio(a._title, b._title);
        if (titleScore >= 0.95) {
          const bonus = a._brand && a._brand === b._brand ? 0.03 : 0;
          addEdge(a._uuid, b._uuid, Math.min(1, titleScore + bonus), "title_almost_exact");
        }
      }
    }
  }

  if (cfg.includeFuzzy) {
    const fuzzyRows = data.filter((r) => r._title);
    const blocks = new Map();
    for (const row of fuzzyRows) {
      const block = row._title.slice(0, 18);
      if (!blocks.has(block)) blocks.set(block, []);
      blocks.get(block).push(row);
    }

    for (const group of blocks.values()) {
      if (group.length < 2 || group.length > cfg.fuzzyBlockMax) continue;
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          const a = group[i];
          const b = group[j];
          if (!a._title || !b._title) continue;
          const titleScore = tokenSetRatio(a._title, b._title);
          if (titleScore < cfg.threshold) continue;
          if (titleScore < 0.95 && hasHardConflict(a._attrs, b._attrs)) continue;
          if (titleScore < cfg.threshold) continue;
          const bonus = a._brand && a._brand === b._brand ? 0.03 : 0;
          const score = Math.min(1, titleScore + bonus);
          if (score >= cfg.threshold) addEdge(a._uuid, b._uuid, score, "title_fuzzy");
        }
      }
    }
  }

  const dsu = new DSU();
  for (const { a, b } of edges.values()) dsu.union(a, b);

  const comps = new Map();
  for (const row of data) {
    const root = dsu.find(row._uuid);
    if (!comps.has(root)) comps.set(root, []);
    comps.get(root).push(row._uuid);
  }

  const groups = [...comps.values()].filter((g) => g.length >= 2).sort((g1, g2) => g2.length - g1.length);
  const bestForUuid = new Map();
  for (const edge of edges.values()) {
    for (const u of [edge.a, edge.b]) {
      if (!bestForUuid.has(u) || bestForUuid.get(u).score < edge.score) bestForUuid.set(u, edge);
    }
  }

  const out = [];
  let groupId = 0;
  for (const uuids of groups) {
    groupId += 1;
    const sorted = [...uuids].sort((a, b) => {
      const sa = String(byUuid.get(a).SKU || "");
      const sb = String(byUuid.get(b).SKU || "");
      return sa.localeCompare(sb) || a.localeCompare(b);
    });

    const brands = sorted.map((u) => byUuid.get(u)._brand).filter(Boolean);
    const brandConflict = new Set(brands).size >= 2;

    for (const u of sorted) {
      const r = byUuid.get(u);
      const best = bestForUuid.get(u) || { score: 0, reason: "" };
      out.push({
        group_id: groupId,
        "score_%": Math.round(best.score * 10000) / 100,
        reason: best.reason,
        brand_conflict: brandConflict,
        "[uuid]": r["[uuid]"],
        SKU: r.SKU,
        "Штрихкод": r["Штрихкод"],
        "Бренд": r["Бренд"],
        Variation_name: r.Variation_name,
        "Вендор код": r["Вендор код"],
        "Назва": r["Назва"]
      });
    }

    out.push({
      group_id: "",
      "score_%": "",
      reason: "",
      brand_conflict: "",
      "[uuid]": "",
      SKU: "",
      "Штрихкод": "",
      "Бренд": "",
      Variation_name: "",
      "Вендор код": "",
      "Назва": ""
    });
  }

  return out;
}

async function onLoadFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const rows = await parseFile(file);
    console.log("[headers]", Object.keys(rows[0] || {}));
    console.log("[first row raw]", rows[0]);

    state.inputRows = ensureColumns(rows);
    state.resultRows = [];
    exportBtn.disabled = true;
    renderTable([]);
    setStatus(`Завантажено: ${file.name}. Рядків: ${state.inputRows.length}`);
  } catch (e) {
    setStatus(`Помилка читання файлу: ${e.message}`);
  }
}

function parseFile(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv")) {
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => resolve(results.data),
        error: reject
      });
    });
  }

  return file.arrayBuffer().then((buf) => {
    const wb = XLSX.read(buf, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(sheet, { defval: "" });
  });
}

function onRun() {
  if (!state.inputRows.length) {
    setStatus("Спочатку завантаж файл.");
    return;
  }

  const cfg = {
    threshold: Number(document.getElementById("threshold").value) / 100,
    includeFuzzy: document.getElementById("includeFuzzy").checked,
    fuzzyBlockMax: Number(document.getElementById("fuzzyBlockMax").value)
  };

  runBtn.disabled = true;
  setStatus("Обробка...");
  setTimeout(() => {
    try {
      state.resultRows = buildGroups(state.inputRows, cfg);
      renderTable(state.resultRows);
      exportBtn.disabled = !state.resultRows.length;
      const groups = new Set(state.resultRows.map((r) => r.group_id).filter(Boolean));
      setStatus(`Готово. Знайдено груп: ${groups.size}`);
    } catch (error) {
      console.error(error);
      setStatus(`Помилка обробки: ${error?.message || error}`);
      exportBtn.disabled = true;
    } finally {
      runBtn.disabled = false;
    }
  }, 0);
}

function normalizeHeaderName(name) {
  return String(name || "")
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function getByHeader(row, candidates) {
  const entries = Object.entries(row || {});
  for (const candidate of candidates) {
    const wanted = normalizeHeaderName(candidate);
    for (const [key, value] of entries) {
      if (normalizeHeaderName(key) === wanted) {
        return value;
      }
    }
  }
  return "";
}

function renderTable(rows) {
  const cols = ["group_id", "score_%", "reason", "brand_conflict", ...CORE_COLS];
  tableEl.innerHTML = "";
  if (!rows.length) return;

  const thead = document.createElement("thead");
  const htr = document.createElement("tr");
  for (const c of cols) {
    const th = document.createElement("th");
    th.textContent = c;
    htr.appendChild(th);
  }
  thead.appendChild(htr);

  const tbody = document.createElement("tbody");
  for (const row of rows) {
    const tr = document.createElement("tr");
    if (!row.group_id) tr.classList.add("sep");
    for (const c of cols) {
      const td = document.createElement("td");
      td.textContent = row[c] ?? "";
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }

  tableEl.appendChild(thead);
  tableEl.appendChild(tbody);
}

function onExport() {
  if (!state.resultRows.length) return;
  const csv = Papa.unparse(state.resultRows);
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "dedupe_groups.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
