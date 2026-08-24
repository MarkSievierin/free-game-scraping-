const assert = require("node:assert/strict");
const test = require("node:test");

const { getCurrentGameUuids, getKnownGameUuidsForStore } = require("../index");

test("getCurrentGameUuids uses the explicit source result", () => {
  assert.deepEqual(
    getCurrentGameUuids({
      games: [],
      currentGameUuids: ["epic:listed-game"],
    }),
    ["epic:listed-game"],
  );
});

test("getCurrentGameUuids falls back to game data for sources without explicit listing UUIDs", () => {
  assert.deepEqual(
    getCurrentGameUuids([
      {
        store: "steam",
        appId: "123",
        link: "https://store.steampowered.com/app/123/example",
      },
    ]),
    ["steam:123"],
  );
});

test("getKnownGameUuidsForStore normalizes UUID collections from repository", () => {
  assert.deepEqual(
    getKnownGameUuidsForStore(
      {
        epic: new Set(["epic:known-game", "", "  epic:trimmed-game  "]),
      },
      "epic",
    ),
    ["epic:known-game", "epic:trimmed-game"],
  );
});

test("getKnownGameUuidsForStore returns an empty list for unknown stores", () => {
  assert.deepEqual(getKnownGameUuidsForStore({}, "epic"), []);
});
