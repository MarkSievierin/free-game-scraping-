function normalizeStore(store) {
  return String(store || "").trim().toLowerCase();
}

function buildGameUuid(game) {
  const store = normalizeStore(game.store);
  const externalId = String(game.appId || game.link || "").trim();

  if (!store || !externalId) {
    return "";
  }

  return `${store}:${externalId}`;
}

module.exports = {
  buildGameUuid,
  normalizeStore,
};
