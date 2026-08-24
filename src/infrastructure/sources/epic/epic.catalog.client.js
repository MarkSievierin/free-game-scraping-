const {
  EPIC_CATALOG_QUERY,
  buildEpicCatalogUrl,
  resolveEpicCatalogConfig,
} = require("./epic.catalog.config");
const { parseEpicBrowseMarkdown } = require("./epic.catalog.parser");
const { enrichEpicProductElements } = require("./epic.product.client");

const EPIC_REQUEST_TIMEOUT_MS = 10000;

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

    if (!isGraphql && payload?.data?.Catalog?.searchStore?.elements?.length === 0) {
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

module.exports = {
  fetchEpicCatalog,
};
