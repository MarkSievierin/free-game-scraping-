const { buildGameUuid } = require("../../../domain/free-game");
const {
  STEAM_URL,
  fetchSteamAppDetails,
  fetchSteamPageMetadata,
  requestText,
} = require("./steam.client");
const {
  extractSteamAppId,
  parseSteamAppDetails,
  parseSteamPageMetadata,
  parseSteamSearchResults,
} = require("./steam.parser");

const DETAIL_REQUEST_DELAY_MIN_MS = 1000;
const DETAIL_REQUEST_DELAY_MAX_MS = 2000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRandomDelayMs() {
  return Math.floor(
    Math.random() * (DETAIL_REQUEST_DELAY_MAX_MS - DETAIL_REQUEST_DELAY_MIN_MS + 1),
  ) + DETAIL_REQUEST_DELAY_MIN_MS;
}

async function enrichGame(game, index) {
  if (!game.appId) {
    return game;
  }

  try {
    if (index > 0) {
      await sleep(getRandomDelayMs());
    }

    const detailsPayload = await fetchSteamAppDetails(game.appId);
    await sleep(getRandomDelayMs());
    const pageHtml = await fetchSteamPageMetadata(game.link);
    const details = parseSteamAppDetails(detailsPayload, game.appId);
    const pageMetadata = parseSteamPageMetadata(pageHtml);

    return {
      ...game,
      description: details.description,
      genres: details.genres,
      tags: pageMetadata.tags,
      offerEndsAt: pageMetadata.offerEndsAt,
    };
  } catch (error) {
    console.error(`Steam details fetch failed for ${game.title}: ${error.message}`);

    return {
      ...game,
      description: game.description || "",
      genres: game.genres || [],
      tags: game.tags || [],
      offerEndsAt: game.offerEndsAt || "",
    };
  }
}

async function fetchFreeGames({ limit, knownGameUuids = [] } = {}) {
  const catalogGames = parseSteamSearchResults(await requestText(STEAM_URL));
  const knownGameUuidSet = new Set(knownGameUuids);
  const currentGameUuids = [];
  const games = [];

  for (const game of catalogGames) {
    const gameUuid = buildGameUuid(game);
    currentGameUuids.push(gameUuid);

    if (!knownGameUuidSet.has(gameUuid)) {
      games.push(game);
    }

    if (limit && games.length >= limit) {
      break;
    }
  }

  const enrichedGames = [];

  for (const [index, game] of games.entries()) {
    enrichedGames.push(await enrichGame(game, index));
  }

  return {
    games: enrichedGames,
    currentGameUuids,
  };
}

module.exports = {
  fetchFreeGames,
  extractSteamAppId,
};
