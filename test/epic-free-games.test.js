const assert = require("node:assert/strict");
const test = require("node:test");

const { buildGameUuid } = require("../src/domain/free-game");
const {
  buildEpicCatalogUrl,
  parseEpicBrowseMarkdown,
  parseEpicGamesFromCatalog,
} = require("../src/infrastructure/sources/epic/epic-catalog.source");

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
      lineOffers: [
        {
          appliedRules: [
            {
              endDate: "2026-08-27T15:00:00.000Z",
            },
          ],
        },
      ],
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
    price: {
      totalPrice: {
        discountPrice: 0,
        originalPrice: 1999,
      },
      lineOffers: [
        {
          appliedRules: [
            {
              endDate: "2026-08-23T15:00:00.000Z",
            },
          ],
        },
      ],
    },
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

  assert.equal(url.hostname, "r.jina.ai");
  assert.equal(url.pathname, "/http://store.epicgames.com/browse");
  assert.match(url.href, /lang=en%26country=US%26sortBy=currentPrice%26sortDir=ASC/);
});

test("Epic reader parser extracts all free base games from the browse catalog", () => {
  const payload = parseEpicBrowseMarkdown(`
*   [![Image 1: Bolmn](https://cdn.example/bolmn.png) Базовая игра Bolmn -100% 18,00$* Бесплатно](http://store.epicgames.com/p/bolmn-aa2906)
*   [![Image 2: Targeted - 10 Days](https://cdn.example/targeted.png) Базовая игра Targeted - 10 Days -100% 3 639,00$* Бесплатно](http://store.epicgames.com/p/targeted-10-days-75a48c)
*   [![Image 3: Cardpocalypse Standard Edition](https://cdn.example/card.png) Базовая игра Cardpocalypse Standard Edition -100% 339,00$* Бесплатно](http://store.epicgames.com/p/cardpocalypse)
*   [![Image 4: Paid](https://cdn.example/paid.png) Базовая игра Paid -50% 18,00$* 9,00$](http://store.epicgames.com/p/paid)
`);
  const games = parseEpicGamesFromCatalog(payload, { locale: "ru-RU" });

  assert.deepEqual(
    games.map((game) => [game.title, game.appId]),
    [
      ["Bolmn", "bolmn-aa2906"],
      ["Targeted - 10 Days", "targeted-10-days-75a48c"],
      ["Cardpocalypse Standard Edition", "cardpocalypse"],
    ],
  );
});

test("Epic catalog parser maps all free base games from a browse page", () => {
  const games = parseEpicGamesFromCatalog({
    data: {
      Catalog: {
        searchStore: {
          elements: [
            buildCatalogElement({
              title: "Bolmn",
              id: "bolmn-id",
              url: null,
              urlSlug: "bolmn-hash",
              catalogNs: {
                mappings: [{ pageSlug: "bolmn-aa2906", pageType: "productHome" }],
              },
            }),
            buildCatalogElement({
              title: "Targeted - 10 Days",
              id: "targeted-id",
              url: null,
              urlSlug: "targeted-hash",
              offerMappings: [{ pageSlug: "targeted-10-days-75a48c", pageType: "productHome" }],
            }),
            buildCatalogElement({
              title: "Cardpocalypse Standard Edition",
              id: "cardpocalypse-id",
              url: null,
              urlSlug: "cardpocalypse-hash",
              productSlug: "cardpocalypse",
            }),
          ],
        },
      },
    },
  },
    { now: new Date("2026-08-24T12:00:00.000Z"), locale: "ru-RU" },
  );

  assert.deepEqual(
    games.map((game) => [game.title, game.appId]),
    [
      ["Bolmn", "bolmn-aa2906"],
      ["Targeted - 10 Days", "targeted-10-days-75a48c"],
      ["Cardpocalypse Standard Edition", "cardpocalypse"],
    ],
  );
});
