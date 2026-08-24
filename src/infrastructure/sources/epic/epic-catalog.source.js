const { buildGameUuid } = require("../../../domain/free-game");

const EPIC_CATALOG_ENDPOINT =
  "https://store.epicgames.com/graphql";
const EPIC_READER_ENDPOINT =
  "https://r.jina.ai/http://store.epicgames.com/browse";
const EPIC_BASE_URL = "https://store.epicgames.com";
const EPIC_DEFAULT_LOCALE = "ru-RU";
const EPIC_DEFAULT_COUNTRY = "UA";
const EPIC_DEFAULT_CATEGORY = "games/edition/base";
const EPIC_DEFAULT_PAGE_SIZE = 40;
const EPIC_REQUEST_TIMEOUT_MS = 10000;

const EPIC_CATALOG_QUERY = `
  query searchStoreQuery(
    $allowCountries: String
    $category: String
    $count: Int
    $country: String!
    $locale: String
    $onSale: Boolean
    $sortBy: String
    $sortDir: String
    $start: Int
    $withPrice: Boolean = false
  ) {
    Catalog {
      searchStore(
        allowCountries: $allowCountries
        category: $category
        count: $count
        country: $country
        locale: $locale
        onSale: $onSale
        sortBy: $sortBy
        sortDir: $sortDir
        start: $start
      ) {
        elements {
          title
          id
          namespace
          description
          keyImages { type url }
          productSlug
          urlSlug
          url
          categories { path }
          catalogNs { mappings(pageType: "productHome") { pageSlug pageType } }
          offerMappings { pageSlug pageType }
          price(country: $country) @include(if: $withPrice) {
            totalPrice {
              discountPrice
              originalPrice
              currencyCode
              currencyInfo { decimals }
              fmtPrice(locale: $locale) { originalPrice }
            }
            lineOffers {
              appliedRules {
                endDate
                discountSetting { discountType }
              }
            }
          }
        }
        paging { count total }
      }
    }
  }
`;

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
    category: EPIC_DEFAULT_CATEGORY,
    pageSize: Number(process.env.EPIC_CATALOG_PAGE_SIZE) || EPIC_DEFAULT_PAGE_SIZE,
    endpoint: normalizeText(process.env.EPIC_GRAPHQL_ENDPOINT) || EPIC_CATALOG_ENDPOINT,
    mode: normalizeText(process.env.EPIC_CATALOG_MODE).toLowerCase() || "reader",
    readerEndpoint: normalizeText(process.env.EPIC_READER_ENDPOINT) || EPIC_READER_ENDPOINT,
  };
}

function buildEpicCatalogUrl(config) {
  const resolvedConfig = resolveEpicCatalogConfig(config);

  if (resolvedConfig.mode === "graphql") {
    return resolvedConfig.endpoint;
  }

  const query = new URLSearchParams({
    lang: resolvedConfig.locale.toLowerCase().startsWith("ru") ? "ru" : "en",
    country: resolvedConfig.country,
    sortBy: "currentPrice",
    sortDir: "ASC",
    priceTier: "tierDiscouted",
    category: "Game",
    count: String(resolvedConfig.pageSize),
  }).toString();

  return `${resolvedConfig.readerEndpoint}?${query.replaceAll("&", "%26")}`;
}

function buildAbsoluteEpicUrl(value) {
  const path = normalizeText(value);

  if (!path) {
    return "";
  }

  if (path.startsWith("http://") || path.startsWith("https://")) {
    const parsedUrl = new URL(path);

    if (parsedUrl.hostname === "store.epicgames.com") {
      parsedUrl.protocol = "https:";
    }

    return parsedUrl.toString();
  }

  return `${EPIC_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

function extractOfferSlug(link) {
  const match = String(link || "").match(/\/p\/([^/?#]+)/);

  return match ? match[1] : "";
}

function getEpicOfferPageSlug(element) {
  const mappings = [
    ...(Array.isArray(element?.catalogNs?.mappings) ? element.catalogNs.mappings : []),
    ...(Array.isArray(element?.offerMappings) ? element.offerMappings : []),
  ];
  const productHomeMapping = mappings.find(
    (mapping) => mapping?.pageType === "productHome" && mapping?.pageSlug,
  );

  return normalizeText(
    productHomeMapping?.pageSlug ||
      element?.productSlug ||
      element?.urlSlug ||
      element?.id,
  );
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

function getActiveLineOffer(element, now = new Date()) {
  const nowTimestamp = now.getTime();
  const lineOffers = element?.price?.lineOffers || [];

  for (const lineOffer of lineOffers) {
    for (const rule of lineOffer?.appliedRules || []) {
      const endTimestamp = rule.endDate ? Date.parse(rule.endDate) : NaN;
      const endsInTheFuture = Number.isNaN(endTimestamp) || endTimestamp > nowTimestamp;

      if (endsInTheFuture) {
        return rule;
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

function mapEpicCatalogElement(element, offer, locale) {
  const catalogPath = normalizeText(element?.url);
  const fallbackSlug = getEpicOfferPageSlug(element);
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
    offerEndsAt: formatEpicOfferEndsAt(offer?.endDate) || normalizeText(element?.readerOfferEndsAt),
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
    const offer = getActiveLineOffer(element, now);
    const hasLineOffers =
      Array.isArray(element?.price?.lineOffers) && element.price.lineOffers.length > 0;

    if (
      element?.price?.totalPrice?.discountPrice !== 0 ||
      (hasLineOffers && !offer) ||
      !isGameCatalogElement(element)
    ) {
      continue;
    }

    const game = mapEpicCatalogElement(element, offer, resolvedLocale);

    if (game) {
      gamesByUuid.set(buildGameUuid(game), game);
    }
  }

  return [...gamesByUuid.values()];
}

function parseEpicBrowseMarkdown(markdown) {
  const elements = [];
  const cardPattern =
    /^\*\s+\[!\[[^\]]*:\s*([^\]]+)\]\(([^)]+)\)\s+(?:Base Game|Базовая игра)\s+(.+?)\s+(-\d+%)\s+(.+?)\*\s+(?:Free|Бесплатно)\]\(([^)]+)\)/gm;

  for (const match of String(markdown || "").matchAll(cardPattern)) {
    const discount = Number.parseInt(match[4].replace("%", ""), 10);

    elements.push({
      title: normalizeText(match[1]),
      url: buildAbsoluteEpicUrl(match[6]),
      categories: [{ path: EPIC_DEFAULT_CATEGORY }],
      keyImages: [{ type: "OfferImageWide", url: normalizeText(match[2]) }],
      price: {
        totalPrice: {
          discountPrice: discount === -100 ? 0 : 1,
          originalPrice: normalizeText(match[5]),
          fmtPrice: { originalPrice: normalizeText(match[5]) },
        },
      },
    });
  }

  return {
    data: {
      Catalog: {
        searchStore: {
          elements,
          paging: { count: elements.length, total: elements.length },
        },
      },
    },
  };
}

function getEpicReaderRoot(readerEndpoint) {
  const marker = "/http://";
  const markerIndex = readerEndpoint.indexOf(marker);

  return markerIndex >= 0 ? readerEndpoint.slice(0, markerIndex) : readerEndpoint;
}

function buildEpicReaderUrl(targetUrl, readerEndpoint) {
  const target = String(targetUrl || "").replace(/^https?:\/\//, "http://");
  const readerRoot = getEpicReaderRoot(readerEndpoint).replace(/\/$/, "");

  return `${readerRoot}/${target.replaceAll("&", "%26")}`;
}

function parseEpicProductMarkdown(markdown) {
  const content = String(markdown || "");
  const descriptionMatch = content.match(/\n\n([^\n]+)\n\nGenres\b/i);
  const saleEndsMatch = content.match(/(?:Sale ends|Распродажа заканчивается)\s+([^\n]+)/i);
  return {
    description: normalizeText(descriptionMatch?.[1] || ""),
    offerEndsAt: normalizeText(saleEndsMatch?.[1] || ""),
  };
}

async function enrichEpicProductElement(element, readerEndpoint) {
  const productUrl = normalizeText(element?.url);

  if (!productUrl) {
    return element;
  }

  try {
    const response = await fetch(buildEpicReaderUrl(productUrl, readerEndpoint), {
      headers: { accept: "text/plain" },
    });

    if (!response.ok) {
      return element;
    }

    const details = parseEpicProductMarkdown(await response.text());

    return {
      ...element,
      description: details.description || element.description,
      readerOfferEndsAt: details.offerEndsAt,
    };
  } catch {
    return element;
  }
}

async function enrichEpicProductElements(payload, readerEndpoint) {
  const elements = payload?.data?.Catalog?.searchStore?.elements;

  if (!Array.isArray(elements)) {
    return payload;
  }

  const freeElements = elements.filter(
    (element) => element?.price?.totalPrice?.discountPrice === 0,
  );
  const enrichedElements = await Promise.all(
    freeElements.map((element) => enrichEpicProductElement(element, readerEndpoint)),
  );
  const enrichedByUrl = new Map(enrichedElements.map((element) => [element.url, element]));

  return {
    ...payload,
    data: {
      ...payload.data,
      Catalog: {
        ...payload.data.Catalog,
        searchStore: {
          ...payload.data.Catalog.searchStore,
          elements: elements.map((element) => enrichedByUrl.get(element.url) || element),
        },
      },
    },
  };
}

async function fetchEpicCatalog(config) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EPIC_REQUEST_TIMEOUT_MS);

  try {
    const resolvedConfig = resolveEpicCatalogConfig(config);
    const isGraphql = resolvedConfig.mode === "graphql";
    const response = await fetch(buildEpicCatalogUrl(resolvedConfig), {
      method: isGraphql ? "POST" : "GET",
      headers: isGraphql
        ? {
            accept: "application/json",
            "content-type": "application/json",
          }
        : { accept: "text/plain" },
      ...(isGraphql
        ? {
            body: JSON.stringify({
              operationName: "searchStoreQuery",
              query: EPIC_CATALOG_QUERY,
              variables: {
                allowCountries: resolvedConfig.allowCountries,
                category: resolvedConfig.category,
                count: resolvedConfig.pageSize,
                country: resolvedConfig.country,
                locale: resolvedConfig.locale,
                onSale: true,
                sortBy: "currentPrice",
                sortDir: "ASC",
                start: 0,
                withPrice: true,
              },
            }),
          }
        : {}),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Epic catalog request failed with HTTP ${response.status}`);
    }

    const payload = isGraphql
      ? await response.json()
      : parseEpicBrowseMarkdown(await response.text());

    if (
      !isGraphql &&
      payload?.data?.Catalog?.searchStore?.elements?.length === 0
    ) {
      throw new Error("Epic catalog reader returned no game cards");
    }

    if (isGraphql && Array.isArray(payload?.errors) && payload.errors.length > 0) {
      throw new Error(`Epic catalog GraphQL error: ${payload.errors[0]?.message || "unknown error"}`);
    }

    return isGraphql
      ? payload
      : enrichEpicProductElements(payload, resolvedConfig.readerEndpoint);
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
  getEpicOfferPageSlug,
  fetchFreeGames,
  parseEpicBrowseMarkdown,
  parseEpicGamesFromCatalog,
};
