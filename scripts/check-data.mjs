import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const files = {
  categories: "data/categories.json",
  handbookItems: "data/handbook-items.json",
  sources: "data/sources.json",
  contacts: "data/contacts.json",
};

const errors = [];
const warnings = [];
const fileResults = [];

function addError(message) {
  errors.push(message);
}

function addWarning(message) {
  warnings.push(message);
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isDateString(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function readJsonArray(label, relativePath) {
  const absolutePath = path.join(rootDir, relativePath);
  if (!existsSync(absolutePath)) {
    addError(`${relativePath}: file is missing`);
    fileResults.push({ name: path.basename(relativePath), ok: false, records: 0 });
    return [];
  }

  let raw = "";
  try {
    raw = readFileSync(absolutePath, "utf8");
  } catch {
    addError(`${relativePath}: file could not be read`);
    fileResults.push({ name: path.basename(relativePath), ok: false, records: 0 });
    return [];
  }

  scanRawForSensitiveValues(path.basename(relativePath), raw);

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    addError(`${relativePath}: JSON parse failed`);
    fileResults.push({ name: path.basename(relativePath), ok: false, records: 0 });
    return [];
  }

  scanParsedForSensitiveValues(path.basename(relativePath), parsed, label);

  if (!Array.isArray(parsed)) {
    addError(`${relativePath}: top-level JSON must be an array`);
    fileResults.push({ name: path.basename(relativePath), ok: false, records: 0 });
    return [];
  }

  fileResults.push({ name: path.basename(relativePath), ok: true, records: parsed.length });
  return parsed;
}

function scanRawForSensitiveValues(fileName, raw) {
  const patterns = [
    ["email-like value", /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i],
    ["GitHub token-like value", /gh[pousr]_[A-Za-z0-9_]{20,}/],
    ["Google API key-like value", /AIza[A-Za-z0-9_-]{20,}/],
    ["GAS deployment URL", /script\.google\.com\/macros\/s/i],
    ["private key block", /-----BEGIN [A-Z ]*PRIVATE KEY-----/i],
    [
      "API or deployment URL",
      /https?:\/\/[^\s"']*(?:\/api\/|api\.|workers\.dev|\/exec|[?&](?:token|key|secret)=)/i,
    ],
    [
      "sensitive JSON key",
      /"(token|secret|private_key|client_secret|access_token|refresh_token|api_key|apikey)"\s*:/i,
    ],
  ];

  const lines = raw.split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const [label, pattern] of patterns) {
      if (pattern.test(line)) {
        addError(`${fileName}:${index + 1}: possible sensitive ${label}`);
      }
    }
  });
}

function scanParsedForSensitiveValues(fileName, value, location) {
  const sensitiveKeys = new Set([
    "token",
    "secret",
    "private_key",
    "client_secret",
    "access_token",
    "refresh_token",
    "api_key",
    "apikey",
  ]);

  function walk(current, currentLocation) {
    if (Array.isArray(current)) {
      current.forEach((item, index) => walk(item, `${currentLocation}[${index}]`));
      return;
    }

    if (!isObject(current)) {
      if (typeof current === "string") {
        if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/i.test(current)) {
          addError(`${fileName}:${currentLocation}: possible private key value`);
        }
        if (/gh[pousr]_[A-Za-z0-9_]{20,}/.test(current)) {
          addError(`${fileName}:${currentLocation}: possible GitHub token-like value`);
        }
        if (/AIza[A-Za-z0-9_-]{20,}/.test(current)) {
          addError(`${fileName}:${currentLocation}: possible Google API key-like value`);
        }
        if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(current)) {
          addError(`${fileName}:${currentLocation}: possible email-like value`);
        }
        if (/script\.google\.com\/macros\/s/i.test(current)) {
          addError(`${fileName}:${currentLocation}: possible GAS deployment URL`);
        }
        if (/https?:\/\/[^\s"']*(?:\/api\/|api\.|workers\.dev|\/exec|[?&](?:token|key|secret)=)/i.test(current)) {
          addError(`${fileName}:${currentLocation}: possible API or deployment URL`);
        }
      }
      return;
    }

    for (const [key, child] of Object.entries(current)) {
      const normalizedKey = key.toLowerCase();
      const childLocation = `${currentLocation}.${key}`;
      if (sensitiveKeys.has(normalizedKey)) {
        addError(`${fileName}:${childLocation}: possible sensitive key`);
      }
      walk(child, childLocation);
    }
  }

  walk(value, location);
}

function requireArrayField(item, index, fieldName) {
  if (Object.hasOwn(item, fieldName) && !Array.isArray(item[fieldName])) {
    addError(`handbook-items[${index}].${fieldName} must be an array`);
  }
}

const categories = readJsonArray("categories", files.categories);
const handbookItems = readJsonArray("handbook-items", files.handbookItems);
const sources = readJsonArray("sources", files.sources);
const contacts = readJsonArray("contacts", files.contacts);

const categoryLabels = new Set(
  categories
    .filter((category) => isObject(category) && isNonEmptyString(category.label))
    .map((category) => category.label.trim()),
);

const seenItemIds = new Map();

handbookItems.forEach((item, index) => {
  if (!isObject(item)) {
    addError(`handbook-items[${index}] must be an object`);
    return;
  }

  if (!isNonEmptyString(item.id)) {
    addError(`handbook-items[${index}].id is required`);
  } else {
    const id = item.id.trim();
    if (seenItemIds.has(id)) {
      addError(`handbook-items[${index}].id duplicates handbook-items[${seenItemIds.get(id)}].id`);
    } else {
      seenItemIds.set(id, index);
    }
    if (id.includes("_")) {
      addWarning(`handbook-items[${index}].id uses underscore`);
    }
  }

  if (!isNonEmptyString(item.title)) {
    addError(`handbook-items[${index}].title is required`);
  }

  if (!isNonEmptyString(item.category)) {
    addError(`handbook-items[${index}].category is required`);
  } else if (!categoryLabels.has(item.category.trim())) {
    addError(`handbook-items[${index}].category does not match categories.label`);
  }

  if (!isNonEmptyString(item.source_checked_at)) {
    addError(`handbook-items[${index}].source_checked_at is required`);
  } else if (!isDateString(item.source_checked_at)) {
    addError(`handbook-items[${index}].source_checked_at must use YYYY-MM-DD`);
  }

  requireArrayField(item, index, "links");
  requireArrayField(item, index, "source_urls");
  requireArrayField(item, index, "tags");

  if (Object.hasOwn(item, "status") && !isNonEmptyString(item.status)) {
    addWarning(`handbook-items[${index}].status is blank`);
  }
});

sources.forEach((source, index) => {
  if (!isObject(source)) {
    addError(`sources[${index}] must be an object`);
    return;
  }

  if (Object.hasOwn(source, "checked_at") && isNonEmptyString(source.checked_at) && !isDateString(source.checked_at)) {
    addError(`sources[${index}].checked_at must use YYYY-MM-DD`);
  }

  if (Object.hasOwn(source, "url")) {
    if (!isNonEmptyString(source.url)) {
      addWarning(`sources[${index}].url is blank`);
    } else if (!/^https?:\/\//.test(source.url)) {
      addError(`sources[${index}].url must start with http:// or https://`);
    }
  }
});

contacts.forEach((contact, index) => {
  if (!isObject(contact)) {
    addError(`contacts[${index}] must be an object`);
    return;
  }

  if (!isNonEmptyString(contact.id)) {
    addWarning(`contacts[${index}] has no stable id`);
  }
});

console.log("Student handbook data check");
console.log("");
console.log("Files:");
for (const result of fileResults) {
  const status = result.ok ? "ok" : "error";
  console.log(`- ${result.name}: ${status}, ${result.records} records`);
}

console.log("");
console.log(`Errors: ${errors.length}`);
console.log(`Warnings: ${warnings.length}`);

if (errors.length > 0) {
  console.log("");
  console.log("Errors:");
  for (const error of errors) {
    console.log(`- ${error}`);
  }
}

if (warnings.length > 0) {
  console.log("");
  console.log("Warnings:");
  for (const warning of warnings) {
    console.log(`- ${warning}`);
  }
}

process.exitCode = errors.length > 0 ? 1 : 0;
