const assert = require("node:assert/strict");
const test = require("node:test");

const { buildGameUuid } = require("../src/services/storage/actual-free-games.repository");
const {
  buildEpicCatalogUrl,
  parseEpicGamesFromCatalog,
} = require("../src/services/epic/free-games.service");

function buildCatalogElement(overrides = {}) {
  return {
    title: "Example Game",
    id: "example-offer-id",
    offerType: "BASE_GAME",
    url: "/ru/p/example-game",
    description: "Example description",
    categories: [{ path: "games" }],
    keyImages: [
      { type: "OfferImageWide", url: "https://cdn.example/image.jpg" },
    ],
    price: {
      totalPrice: {
        discountPrice: 0,
        originalPrice: 1999,
        fmtPrice: {
          originalPrice: "19,99 ₴",
        },
      },
    },
    promotions: {
      promotionalOffers: [
        {
          promotionalOffers: [
            {
              startDate: "2026-08-20T15:00:00.000Z",
              endDate: "2026-08-27T15:00:00.000Z",
              discountSetting: {
                discountPercentage: 0,
              },
            },
          ],
        },
      ],
    },
    ...overrides,
  };
}

test("Epic catalog parser maps an active free offer to the game contract", () => {
  const games = parseEpicGamesFromCatalog(
    {
      data: {
        Catalog: {
          searchStore: {
            elements: [buildCatalogElement()],
          },
        },
      },
    },
    {
      now: new Date("2026-08-24T12:00:00.000Z"),
      locale: "ru-RU",
    },
  );

  assert.equal(games.length, 1);
  assert.equal(games[0].store, "epic");
  assert.equal(games[0].appId, "example-game");
  assert.equal(games[0].title, "Example Game");
  assert.equal(games[0].description, "Example description");
  assert.equal(games[0].link, "https://store.epicgames.com/ru/p/example-game");
  assert.equal(games[0].imageUrl, "https://cdn.example/image.jpg");
  assert.equal(games[0].discount, "-100%");
  assert.equal(games[0].price, "Бесплатно");
  assert.equal(games[0].originalPrice, "19,99 ₴");
  assert.equal(buildGameUuid(games[0]), "epic:example-game");
});

test("Epic catalog parser skips paid and upcoming offers", () => {
  const paidElement = buildCatalogElement({
    title: "Paid Game",
    price: {
      totalPrice: {
        discountPrice: 999,
        originalPrice: 1999,
      },
    },
  });
  const upcomingElement = buildCatalogElement({
    title: "Upcoming Game",
    promotions: {
      promotionalOffers: [
        {
          promotionalOffers: [
            {
              startDate: "2026-08-27T15:00:00.000Z",
              endDate: "2026-09-03T15:00:00.000Z",
              discountSetting: {
                discountPercentage: 0,
              },
            },
          ],
        },
      ],
    },
  });

  const games = parseEpicGamesFromCatalog(
    {
      data: {
        Catalog: {
          searchStore: {
            elements: [paidElement, upcomingElement],
          },
        },
      },
    },
    { now: new Date("2026-08-24T12:00:00.000Z") },
  );

  assert.deepEqual(games, []);
});

test("Epic catalog parser skips free add-ons", () => {
  const games = parseEpicGamesFromCatalog(
    {
      data: {
        Catalog: {
          searchStore: {
            elements: [
              buildCatalogElement({
                title: "Free Add-on",
                offerType: "ADD_ON",
                categories: [{ path: "addons" }],
              }),
            ],
          },
        },
      },
    },
    { now: new Date("2026-08-24T12:00:00.000Z") },
  );

  assert.deepEqual(games, []);
});

test("Epic catalog URL uses the configured locale and country", () => {
  const url = new URL(
    buildEpicCatalogUrl({
      locale: "en-US",
      country: "US",
      allowCountries: "US",
    }),
  );

  assert.equal(url.hostname, "store-site-backend-static-ipv4.ak.epicgames.com");
  assert.equal(url.pathname, "/freeGamesPromotions");
  assert.equal(url.searchParams.get("locale"), "en-US");
  assert.equal(url.searchParams.get("country"), "US");
  assert.equal(url.searchParams.get("allowCountries"), "US");
});
