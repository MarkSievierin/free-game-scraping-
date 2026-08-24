const cheerio = require("cheerio");
const { buildGameUuid } = require("../../../domain/free-game");

const STEAM_LANGUAGE = "russian";
const STEAM_COUNTRY_CODE = "ru";
const STEAM_URL =
  `https://store.steampowered.com/search/results/?sort_by=Price_ASC&force_infinite=1&specials=1&l=${STEAM_LANGUAGE}&cc=${STEAM_COUNTRY_CODE}`;
const STEAM_APP_DETAILS_URL = "https://store.steampowered.com/api/appdetails";
const STEAM_REQUEST_HEADERS = {
  "User-Agent": "Mozilla/5.0",
};
const DETAIL_REQUEST_DELAY_MIN_MS = 1000;
const DETAIL_REQUEST_DELAY_MAX_MS = 2000;
const MAX_TAGS = 5;
const MAX_GENRES = 4;

function extractSteamAppId(link) {
  const match = link.match(/\/app\/(\d+)\//);
  return match ? match[1] : "";
}

function buildSteamHeaderImageUrl(link, fallbackImageUrl) {
  const appId = extractSteamAppId(link);

  if (!appId) {
    return fallbackImageUrl;
  }

  return `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg`;
}

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function decodeHtmlEntities(value) {
  const $ = cheerio.load(`<div>${String(value || "")}</div>`);
  return $("div").text();
}

function normalizePrice(price) {
  const normalizedPrice = normalizeText(price);

  if (!normalizedPrice.includes("руб")) {
    return normalizedPrice;
  }

  const numericPart = normalizedPrice.replace(/\s*руб\.?/i, "").trim();
  return `$${numericPart}`;
}

function buildLocalizedSteamUrl(url) {
  if (!url) {
    return "";
  }

  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}l=${STEAM_LANGUAGE}&cc=${STEAM_COUNTRY_CODE}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRandomDelayMs() {
  return Math.floor(
    Math.random() * (DETAIL_REQUEST_DELAY_MAX_MS - DETAIL_REQUEST_DELAY_MIN_MS + 1),
  ) + DETAIL_REQUEST_DELAY_MIN_MS;
}

async function requestText(url) {
  const response = await fetch(url, {
    headers: STEAM_REQUEST_HEADERS,
  });

  if (!response.ok) {
    throw new Error(`Steam request failed with status ${response.status}`);
  }

  return response.text();
}

async function requestJson(url) {
  const response = await fetch(url, {
    headers: STEAM_REQUEST_HEADERS,
  });

  if (!response.ok) {
    throw new Error(`Steam request failed with status ${response.status}`);
  }

  return response.json();
}

function extractOfferEndsAt(discountQuantityText) {
  const normalizedText = normalizeText(discountQuantityText);
  const match = normalizedText.match(/до\s+(\d{1,2}\s+[а-яё]+(?:\s+в\s+\d{1,2}:\d{2})?)/i);

  if (!match) {
    return "";
  }

  return match[1];
}

async function fetchSteamAppDetails(appId) {
  const url =
    `${STEAM_APP_DETAILS_URL}?appids=${appId}&l=${STEAM_LANGUAGE}&cc=${STEAM_COUNTRY_CODE}`;
  const payload = await requestJson(url);
  const appPayload = payload[appId];

  if (!appPayload?.success || !appPayload.data) {
    return {
      description: "",
      genres: [],
    };
  }

  return {
    description: normalizeText(decodeHtmlEntities(appPayload.data.short_description)),
    genres: Array.isArray(appPayload.data.genres)
      ? appPayload.data.genres
          .map((genre) => normalizeText(genre.description))
          .filter(Boolean)
          .slice(0, MAX_GENRES)
      : [],
  };
}

async function fetchSteamPageMetadata(link) {
  if (!link) {
    return {
      tags: [],
      offerEndsAt: "",
    };
  }

  const html = await requestText(buildLocalizedSteamUrl(link));
  const $ = cheerio.load(html);

  const tags = $(".app_tag")
    .toArray()
    .map((element) => normalizeText($(element).text()))
    .filter(Boolean)
    .filter((tag, index, array) => array.indexOf(tag) === index)
    .slice(0, MAX_TAGS);

  const discountQuantityText = normalizeText($(".game_purchase_discount_quantity").first().text());
  const offerEndsAt = extractOfferEndsAt(discountQuantityText);

  return {
    tags,
    offerEndsAt,
  };
}

async function enrichGame(game, index) {
  if (!game.appId) {
    return game;
  }

  try {
    if (index > 0) {
      await sleep(getRandomDelayMs());
    }

    const details = await fetchSteamAppDetails(game.appId);
    await sleep(getRandomDelayMs());
    const pageMetadata = await fetchSteamPageMetadata(game.link);

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
  const html = await requestText(STEAM_URL);
  const $ = cheerio.load(html);
  const freeGames = [];
  const currentGameUuids = [];
  const knownGameUuidSet = new Set(knownGameUuids);

  $(".search_result_row").each((_, element) => {
    if (limit && freeGames.length >= limit) {
      return false;
    }

    const item = $(element);
    const title = item.find(".title").text().trim() || "Без названия";
    const discount = item.find(".discount_pct").text().trim();
    const price = normalizePrice(item.find(".discount_final_price").text().trim() || "Без цены");
    const link = item.attr("href")?.trim() || "";
    const appId = extractSteamAppId(link);
    const fallbackImageUrl = item.find("img").attr("src")?.trim() || "";
    const imageUrl = buildSteamHeaderImageUrl(link, fallbackImageUrl);

    if (discount.includes("-100%")) {
      const game = {
        appId,
        store: "steam",
        title,
        discount,
        price,
        link,
        imageUrl,
        description: "",
        genres: [],
        tags: [],
        offerEndsAt: "",
      };

      const gameUuid = buildGameUuid(game);

      if (gameUuid) {
        currentGameUuids.push(gameUuid);
      }

      if (!knownGameUuidSet.has(gameUuid)) {
        freeGames.push(game);
      }
    }
  });

  const enrichedGames = [];

  for (const [index, game] of freeGames.entries()) {
    const enrichedGame = await enrichGame(game, index);
    enrichedGames.push(enrichedGame);
  }

  Object.defineProperty(enrichedGames, "currentGameUuids", {
    value: currentGameUuids,
    enumerable: false,
  });

  return enrichedGames;
}

module.exports = {
  fetchFreeGames,
  extractSteamAppId,
};
