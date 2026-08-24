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
  if (Array.isArray(games.currentGameUuids)) {
    return games.currentGameUuids;
  }

  return games.map(buildGameUuid).filter(Boolean);
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
    const epicGames = await fetchEpicFreeGames({
      limit: maxGames,
      knownGameUuids: getKnownGameUuidsForStore(knownGameUuidsByType, "epic"),
    });
    games.push(...epicGames);
    currentGameUuids.push(...getCurrentGameUuids(epicGames));
  }

  if (enableSteam) {
    const steamGames = await fetchSteamFreeGames({
      limit: maxGames,
      knownGameUuids: getKnownGameUuidsForStore(knownGameUuidsByType, "steam"),
    });
    games.push(...steamGames);
    currentGameUuids.push(...getCurrentGameUuids(steamGames));
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
