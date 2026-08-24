const { buildGameUuid } = require("../storage/actual-free-games.repository");

const EPIC_CATALOG_ENDPOINT =
  "https://store-site-backend-static-ipv4.ak.epicgames.com/freeGamesPromotions";
const EPIC_BASE_URL = "https://store.epicgames.com";
const EPIC_DEFAULT_LOCALE = "ru-RU";
const EPIC_DEFAULT_COUNTRY = "UA";
const EPIC_REQUEST_TIMEOUT_MS = 10000;

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function resolveEpicCatalogConfig({ locale, country, allowCountries } = {}) {
  const resolvedLocale = normalizeText(locale || process.env.EPIC_LOCALE) || EPIC_DEFAULT_LOCALE;
  const resolvedCountry = normalizeText(country || process.env.EPIC_COUNTRY) || EPIC_DEFAULT_COUNTRY;
  const resolvedAllowCountries =
    normalizeText(allowCountries || process.env.EPIC_ALLOW_COUNTRIES) || resolvedCountry;

  return {
    locale: resolvedLocale,
    country: resolvedCountry,
    allowCountries: resolvedAllowCountries,
  };
}

function buildEpicCatalogUrl(config) {
  const resolvedConfig = resolveEpicCatalogConfig(config);
  const query = new URLSearchParams(resolvedConfig);

  return `${EPIC_CATALOG_ENDPOINT}?${query.toString()}`;
}

function buildAbsoluteEpicUrl(value) {
  const path = normalizeText(value);

  if (!path) {
    return "";
  }

  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }

  return `${EPIC_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

function extractOfferSlug(link) {
  const match = String(link || "").match(/\/p\/([^/?#]+)/);

  return match ? match[1] : "";
}

function formatEpicOfferEndsAt(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return normalizeText(value);
  }

  const formatter = new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Europe/Berlin",
  });
  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  return `${parts.day}.${parts.month}.${parts.year} в ${parts.hour}:${parts.minute}`;
}

function getActivePromotionalOffer(element, now = new Date()) {
  const nowTimestamp = now.getTime();
  const promotionGroups = element?.promotions?.promotionalOffers || [];

  for (const group of promotionGroups) {
    for (const promotion of group?.promotionalOffers || []) {
      const startTimestamp = promotion.startDate ? Date.parse(promotion.startDate) : NaN;
      const endTimestamp = promotion.endDate ? Date.parse(promotion.endDate) : NaN;
      const startsInThePast = Number.isNaN(startTimestamp) || startTimestamp <= nowTimestamp;
      const endsInTheFuture = Number.isNaN(endTimestamp) || endTimestamp > nowTimestamp;
      const isFreePromotion = promotion.discountSetting?.discountPercentage === 0;

      if (startsInThePast && endsInTheFuture && isFreePromotion) {
        return promotion;
      }
    }
  }

  return null;
}

function getEpicImageUrl(element) {
  const images = Array.isArray(element?.keyImages) ? element.keyImages : [];
  const preferredImageTypes = ["OfferImageWide", "OfferImageTall", "Thumbnail", "OfferImage"];

  for (const imageType of preferredImageTypes) {
    const image = images.find((candidate) => candidate?.type === imageType && candidate?.url);

    if (image) {
      return normalizeText(image.url);
    }
  }

  return normalizeText(images.find((image) => image?.url)?.url || "");
}

function getEpicOriginalPrice(element) {
  const formattedPrice = element?.price?.totalPrice?.fmtPrice?.originalPrice;

  if (formattedPrice) {
    return normalizeText(formattedPrice);
  }

  const originalPrice = element?.price?.totalPrice?.originalPrice;
  const decimals = element?.price?.totalPrice?.currencyInfo?.decimals;

  if (typeof originalPrice !== "number") {
    return "";
  }

  const divisor = 10 ** (Number.isInteger(decimals) ? decimals : 2);

  return String(originalPrice / divisor);
}

function getEpicTags(element) {
  const productType = normalizeText(element?.offerType) === "BASE_GAME" ? "Game" : "";

  return productType ? [productType] : [];
}

function isGameCatalogElement(element) {
  const categories = Array.isArray(element?.categories) ? element.categories : [];
  const categoryPaths = categories
    .map((category) => normalizeText(category?.path).toLowerCase())
    .filter(Boolean);

  return categoryPaths.some((path) => path === "games" || path.startsWith("games/"));
}

function mapEpicCatalogElement(element, promotion, locale) {
  const catalogPath = normalizeText(element?.url);
  const fallbackSlug = normalizeText(element?.urlSlug || element?.productSlug || element?.id);
  const fallbackLocale = locale.toLowerCase() === "ru-ru" ? "ru" : locale;
  const link = buildAbsoluteEpicUrl(catalogPath || `/${fallbackLocale}/p/${fallbackSlug}`);
  const appId =
    extractOfferSlug(link) || fallbackSlug;

  if (!appId || !normalizeText(element?.title)) {
    return null;
  }

  const productType =
    normalizeText(element?.offerType) === "BASE_GAME"
      ? "Game"
      : normalizeText(element?.offerType || "Game");
  const tags = getEpicTags(element);

  if (productType && !tags.includes(productType)) {
    tags.unshift(productType);
  }

  return {
    appId,
    store: "epic",
    catalogPath: catalogPath || `/${fallbackLocale}/p/${appId}`,
    productType,
    title: normalizeText(element.title),
    discount: "-100%",
    price: "Бесплатно",
    originalPrice: getEpicOriginalPrice(element),
    link,
    imageUrl: getEpicImageUrl(element),
    description: normalizeText(element.description || element.longDescription || ""),
    genres: [],
    tags,
    offerEndsAt: formatEpicOfferEndsAt(promotion.endDate),
  };
}

function parseEpicGamesFromCatalog(payload, { now = new Date(), locale } = {}) {
  const elements = payload?.data?.Catalog?.searchStore?.elements;
  const resolvedLocale = normalizeText(locale) || resolveEpicCatalogConfig().locale;
  const gamesByUuid = new Map();

  if (!Array.isArray(elements)) {
    return [];
  }

  for (const element of elements) {
    const promotion = getActivePromotionalOffer(element, now);

    if (
      !promotion ||
      element?.price?.totalPrice?.discountPrice !== 0 ||
      !isGameCatalogElement(element)
    ) {
      continue;
    }

    const game = mapEpicCatalogElement(element, promotion, resolvedLocale);

    if (game) {
      gamesByUuid.set(buildGameUuid(game), game);
    }
  }

  return [...gamesByUuid.values()];
}

async function fetchEpicCatalog(config) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EPIC_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(buildEpicCatalogUrl(config), {
      headers: {
        accept: "application/json",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Epic catalog request failed with HTTP ${response.status}`);
    }

    return response.json();
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(`Epic catalog request timed out after ${EPIC_REQUEST_TIMEOUT_MS}ms`);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

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

  Object.defineProperty(games, "currentGameUuids", {
    value: currentGameUuids,
    enumerable: false,
  });

  return games;
}

module.exports = {
  buildEpicCatalogUrl,
  fetchFreeGames,
  parseEpicGamesFromCatalog,
};
