const { buildGameUuid } = require("../../../domain/free-game");
const {
  buildEpicCatalogUrl,
  resolveEpicCatalogConfig,
} = require("./epic.catalog.config");
const {
  getEpicOfferPageSlug,
  parseEpicBrowseMarkdown,
  parseEpicGamesFromCatalog,
} = require("./epic.catalog.parser");
const { fetchEpicCatalog } = require("./epic.catalog.client");

async function fetchFreeGames({ limit, knownGameUuids = [], catalogConfig } = {}) {
  const config = resolveEpicCatalogConfig(catalogConfig);
  const payload = await fetchEpicCatalog(config);
  const catalogGames = parseEpicGamesFromCatalog(payload, {
    locale: config.locale,
  });
  const currentGameUuids = catalogGames.map(buildGameUuid).filter(Boolean);
  const knownGameUuidSet = new Set(knownGameUuids);
  const games = catalogGames
    .filter((game) => !knownGameUuidSet.has(buildGameUuid(game)))
    .slice(0, limit || Number.MAX_SAFE_INTEGER);

  return {
    games,
    currentGameUuids,
  };
}

module.exports = {
  buildEpicCatalogUrl,
  getEpicOfferPageSlug,
  fetchFreeGames,
  parseEpicBrowseMarkdown,
  parseEpicGamesFromCatalog,
};
