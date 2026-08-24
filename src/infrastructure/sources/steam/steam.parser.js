const cheerio = require("cheerio");
const { buildGameUuid } = require("../../../domain/free-game");
const { normalizeText } = require("../../../shared/text");

const MAX_TAGS = 5;
const MAX_GENRES = 4;

function extractSteamAppId(link) {
  const match = String(link || "").match(/\/app\/(\d+)\//);

  return match ? match[1] : "";
}

function buildSteamHeaderImageUrl(link, fallbackImageUrl) {
  const appId = extractSteamAppId(link);

  if (!appId) {
    return fallbackImageUrl;
  }

  return `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg`;
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

function extractOfferEndsAt(discountQuantityText) {
  const normalizedText = normalizeText(discountQuantityText);
  const match = normalizedText.match(/до\s+(\d{1,2}\s+[а-яё]+(?:\s+в\s+\d{1,2}:\d{2})?)/i);

  return match ? match[1] : "";
}

function parseSteamSearchResults(html) {
  const $ = cheerio.load(html);
  const games = [];

  $(".search_result_row").each((_, element) => {
    const item = $(element);
    const discount = item.find(".discount_pct").text().trim();

    if (!discount.includes("-100%")) {
      return;
    }

    const link = item.attr("href")?.trim() || "";
    const game = {
      appId: extractSteamAppId(link),
      store: "steam",
      title: item.find(".title").text().trim() || "Без названия",
      discount,
      price: normalizePrice(item.find(".discount_final_price").text().trim() || "Без цены"),
      link,
      imageUrl: buildSteamHeaderImageUrl(link, item.find("img").attr("src")?.trim() || ""),
      description: "",
      genres: [],
      tags: [],
      offerEndsAt: "",
    };

    if (buildGameUuid(game)) {
      games.push(game);
    }
  });

  return games;
}

function parseSteamAppDetails(payload, appId) {
  const appPayload = payload?.[appId];

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

function parseSteamPageMetadata(html) {
  const $ = cheerio.load(html);
  const tags = $(".app_tag")
    .toArray()
    .map((element) => normalizeText($(element).text()))
    .filter(Boolean)
    .filter((tag, index, array) => array.indexOf(tag) === index)
    .slice(0, MAX_TAGS);
  const discountQuantityText = normalizeText($(".game_purchase_discount_quantity").first().text());

  return {
    tags,
    offerEndsAt: extractOfferEndsAt(discountQuantityText),
  };
}

module.exports = {
  extractSteamAppId,
  parseSteamAppDetails,
  parseSteamPageMetadata,
  parseSteamSearchResults,
};
