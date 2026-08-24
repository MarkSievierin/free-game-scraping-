const { normalizeText } = require("../../../shared/text");

const EPIC_CATALOG_ENDPOINT = "https://store.epicgames.com/graphql";
const EPIC_READER_ENDPOINT = "https://r.jina.ai/http://store.epicgames.com/browse";
const EPIC_BASE_URL = "https://store.epicgames.com";
const EPIC_DEFAULT_LOCALE = "ru-RU";
const EPIC_DEFAULT_COUNTRY = "UA";
const EPIC_DEFAULT_CATEGORY = "games/edition/base";
const EPIC_DEFAULT_PAGE_SIZE = 40;

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

module.exports = {
  EPIC_BASE_URL,
  EPIC_CATALOG_ENDPOINT,
  EPIC_CATALOG_QUERY,
  EPIC_DEFAULT_CATEGORY,
  EPIC_READER_ENDPOINT,
  buildEpicCatalogUrl,
  resolveEpicCatalogConfig,
};
