const { normalizeText } = require("../../../shared/text");
const { parseEpicProductMarkdown } = require("./epic.product.parser");

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

module.exports = {
  buildEpicReaderUrl,
  enrichEpicProductElements,
  getEpicReaderRoot,
};
