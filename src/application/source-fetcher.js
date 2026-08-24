const { buildGameUuid } = require("../domain/free-game");
const { fetchFreeGames: fetchEpicFreeGames } = require("../infrastructure/sources/epic/epic-catalog.source");
const { fetchFreeGames: fetchSteamFreeGames } = require("../infrastructure/sources/steam/steam.source");

function getKnownGameUuidsForStore(knownGameUuidsByType, store) {
  const uuids = knownGameUuidsByType?.[store];

  if (!uuids) {
    return [];
  }

  return Array.from(uuids).map((uuid) => String(uuid || "").trim()).filter(Boolean);
}

function getCurrentGameUuids(games) {
  if (Array.isArray(games?.currentGameUuids)) {
    return games.currentGameUuids;
  }

  return Array.isArray(games) ? games.map(buildGameUuid).filter(Boolean) : [];
}

function normalizeSourceResult(result) {
  if (Array.isArray(result)) {
    return {
      games: result,
      currentGameUuids: getCurrentGameUuids(result),
    };
  }

  return {
    games: Array.isArray(result?.games) ? result.games : [],
    currentGameUuids: getCurrentGameUuids(result),
  };
}

async function fetchGamesFromEnabledSources({
  maxGames,
  enableEpic,
  enableSteam,
  knownGameUuidsByType = {},
}) {
  const games = [];
  const currentGameUuids = [];

  if (enableEpic) {
    const epicResult = await fetchEpicFreeGames({
      limit: maxGames,
      knownGameUuids: getKnownGameUuidsForStore(knownGameUuidsByType, "epic"),
    });
    const epic = normalizeSourceResult(epicResult);
    games.push(...epic.games);
    currentGameUuids.push(...epic.currentGameUuids);
  }

  if (enableSteam) {
    const steamResult = await fetchSteamFreeGames({
      limit: maxGames,
      knownGameUuids: getKnownGameUuidsForStore(knownGameUuidsByType, "steam"),
    });
    const steam = normalizeSourceResult(steamResult);
    games.push(...steam.games);
    currentGameUuids.push(...steam.currentGameUuids);
  }

  return {
    games,
    currentGameUuids: [...new Set(currentGameUuids)],
  };
}

function countKnownGameUuids(knownGameUuidsByType) {
  return Object.fromEntries(
    Object.entries(knownGameUuidsByType || {}).map(([store, uuids]) => [
      store,
      uuids?.size || 0,
    ]),
  );
}

module.exports = {
  countKnownGameUuids,
  fetchGamesFromEnabledSources,
  getCurrentGameUuids,
  getKnownGameUuidsForStore,
};
