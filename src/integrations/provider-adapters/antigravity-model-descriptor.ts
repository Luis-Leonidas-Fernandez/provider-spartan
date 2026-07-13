export type AntigravityModelFamily = "gemini" | "claude" | "gpt-oss" | "unknown";
export type AntigravityModelQuality = "low" | "medium" | "high" | "thinking" | "unknown";
export type AntigravityRuntimeModel = "flash" | "pro" | "flash_lite";

function slugify(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[^\w\s.-]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s./]+/g, "-")
    .replace(/-+/g, "-");
}

function inferFamily(label: string): AntigravityModelFamily {
  const value = label.toLowerCase();
  if (value.includes("gemini")) return "gemini";
  if (value.includes("claude")) return "claude";
  if (value.includes("gpt-oss")) return "gpt-oss";
  return "unknown";
}

function inferQuality(label: string): AntigravityModelQuality {
  const value = label.toLowerCase();
  if (value.includes("thinking")) return "thinking";
  if (value.includes("high")) return "high";
  if (value.includes("medium")) return "medium";
  if (value.includes("low")) return "low";
  return "unknown";
}

function inferRuntimeModel(
  label: string,
  family: AntigravityModelFamily,
  quality: AntigravityModelQuality,
): AntigravityRuntimeModel {
  const value = label.toLowerCase();
  if (value.includes("lite")) return "flash_lite";
  if (value.includes("flash")) return "flash";
  if (value.includes("pro")) return "pro";
  if (family !== "gemini" && (quality === "high" || quality === "thinking")) return "pro";
  return "flash";
}

function extractVersion(label: string) {
  const version = label.match(/\d+(?:\.\d+)*(?:[a-z])?/i)?.[0];
  return version ?? null;
}

function buildCatalogModelKey(label: string, family: AntigravityModelFamily, quality: AntigravityModelQuality) {
  const value = label.trim();
  const version = extractVersion(value);

  if (family === "claude") {
    if (value.toLowerCase().includes("sonnet")) {
      return version ? `claude-sonnet-${version}` : "claude-sonnet";
    }
    if (value.toLowerCase().includes("opus")) {
      return version ? `claude-opus-${version}` : "claude-opus";
    }
  }

  if (family === "gpt-oss") {
    const size = value.match(/gpt-oss\s+([a-z0-9.-]+)/i)?.[1];
    return size ? `gpt-oss-${slugify(size)}` : "gpt-oss";
  }

  if (family === "gemini") {
    if (value.toLowerCase().includes("flash")) {
      return version ? `gemini-${version}-flash` : "gemini-flash";
    }
    if (value.toLowerCase().includes("pro")) {
      return version ? `gemini-${version}-pro` : "gemini-pro";
    }
  }

  const fallback = slugify(value.replace(/\(([^)]+)\)/g, ""));
  return quality !== "unknown" ? `${fallback}-${quality}` : fallback;
}

function buildAliases(input: {
  label: string;
  family: AntigravityModelFamily;
  runtimeModel: AntigravityRuntimeModel;
  catalogModelKey: string;
}) {
  const aliases = new Set<string>([
    input.label.trim().toLowerCase(),
    input.catalogModelKey,
  ]);

  if (input.family === "gemini") {
    if (input.runtimeModel === "pro") {
      aliases.add("gemini-2.5-pro");
      aliases.add("gemini-pro");
      aliases.add("pro");
    }
    if (input.runtimeModel === "flash") {
      aliases.add("gemini-2.5-flash");
      aliases.add("gemini-flash");
      aliases.add("flash");
    }
    if (input.runtimeModel === "flash_lite") {
      aliases.add("gemini-2.5-flash-lite");
      aliases.add("gemini-2.5-flash_lite");
      aliases.add("gemini-flash-lite");
      aliases.add("flash-lite");
      aliases.add("flash_lite");
    }
  }

  return [...aliases];
}

export type AntigravityModelDescriptor = {
  label: string;
  runtimeModel: AntigravityRuntimeModel;
  family: AntigravityModelFamily;
  quality: AntigravityModelQuality;
  catalogModelKey: string;
  aliases: string[];
};

export function describeAntigravityModelLabel(label: string): AntigravityModelDescriptor {
  const family = inferFamily(label);
  const quality = inferQuality(label);
  const runtimeModel = inferRuntimeModel(label, family, quality);
  const catalogModelKey = buildCatalogModelKey(label, family, quality);

  return {
    label,
    runtimeModel,
    family,
    quality,
    catalogModelKey,
    aliases: buildAliases({
      label,
      family,
      runtimeModel,
      catalogModelKey,
    }),
  };
}
