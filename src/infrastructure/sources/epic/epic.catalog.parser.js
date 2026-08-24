const { buildGameUuid } = require("../../../domain/free-game");
const { normalizeText } = require("../../../shared/text");
const {
  EPIC_BASE_URL,
  EPIC_DEFAULT_CATEGORY,
  resolveEpicCatalogConfig,
} = require("./epic.catalog.config");

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
  const appId = extractOfferSlug(link) || fallbackSlug;

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

module.exports = {
  buildAbsoluteEpicUrl,
  extractOfferSlug,
  getEpicOfferPageSlug,
  parseEpicBrowseMarkdown,
  parseEpicGamesFromCatalog,
};
