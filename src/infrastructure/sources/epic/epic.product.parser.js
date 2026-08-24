const { normalizeText } = require("../../../shared/text");

function parseEpicProductMarkdown(markdown) {
  const content = String(markdown || "");
  const descriptionMatch = content.match(/\n\n([^\n]+)\n\nGenres\b/i);
  const saleEndsMatch = content.match(/(?:Sale ends|Распродажа заканчивается)\s+([^\n]+)/i);

  return {
    description: normalizeText(descriptionMatch?.[1] || ""),
    offerEndsAt: normalizeText(saleEndsMatch?.[1] || ""),
  };
}

module.exports = {
  parseEpicProductMarkdown,
};
