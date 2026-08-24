function resolveMaxGamesLimit(value) {
  const normalizedValue = String(value || "").trim();

  if (!normalizedValue) {
    return undefined;
  }

  const limit = Number.parseInt(normalizedValue, 10);

  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error("MAX_GAMES must be a positive integer or empty");
  }

  return limit;
}

function resolveBooleanEnv(value, defaultValue) {
  const normalizedValue = String(value || "").trim().toLowerCase();

  if (!normalizedValue) {
    return defaultValue;
  }

  if (["1", "true", "yes", "on"].includes(normalizedValue)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalizedValue)) {
    return false;
  }

  throw new Error(`Invalid boolean env value: ${value}`);
}

function normalizeServerType(value) {
  return String(value || "").trim().toLowerCase() === "prod" ? "prod" : "stage";
}

function resolveRuntimeConfig(env = process.env) {
  const config = {
    appType: String(env.APP_TYPE || "").trim().toLowerCase(),
    serverType: normalizeServerType(env.APP_TYPE),
    maxGames: resolveMaxGamesLimit(env.MAX_GAMES),
    enableEpic: resolveBooleanEnv(env.ENABLE_EPIC, true),
    enableSteam: resolveBooleanEnv(env.ENABLE_STEAM, false),
  };

  if (!config.enableEpic && !config.enableSteam) {
    throw new Error("At least one source must be enabled: ENABLE_EPIC or ENABLE_STEAM");
  }

  return config;
}

module.exports = {
  normalizeServerType,
  resolveBooleanEnv,
  resolveMaxGamesLimit,
  resolveRuntimeConfig,
};
