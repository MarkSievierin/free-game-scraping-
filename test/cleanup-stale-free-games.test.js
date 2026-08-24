const assert = require("node:assert/strict");
const test = require("node:test");

const {
  cleanupStaleFreeGameMessages,
} = require("../src/application/cleanup-stale-free-game-messages");

function createFakeTelegramClient(calls) {
  return {
    async deleteMessage(payload) {
      calls.push({ method: "deleteMessage", payload });
    },
    async editMessageText(payload) {
      calls.push({ method: "editMessageText", payload });
    },
    async editMessageCaption(payload) {
      calls.push({ method: "editMessageCaption", payload });
    },
  };
}

function createRepositoryForActiveGame(game, calls) {
  return {
    async findActiveGamesMissingFromCurrent({ currentGameUuids, enabledStores }) {
      calls.push({ method: "findActiveGamesMissingFromCurrent", currentGameUuids, enabledStores });

      if (currentGameUuids.includes(game.uuid)) {
        return [];
      }

      return [game];
    },
    async markGameDeleted(id) {
      calls.push({ method: "markGameDeleted", id });
    },
    async markGameEnded(id) {
      calls.push({ method: "markGameEnded", id });
    },
    async markGameDeleteFailed(id) {
      calls.push({ method: "markGameDeleteFailed", id });
    },
    async markGameEditFailed(id) {
      calls.push({ method: "markGameEditFailed", id });
    },
  };
}

test("cleanup does not end an Epic game while its UUID is still present in listing", async () => {
  const calls = [];
  const game = {
    id: 1,
    uuid: "epic:listed-game",
    type: "epic",
    title: "Listed Game",
    chat_id: 123,
    telegram_message_id: 456,
    telegram_message_kind: "message",
    message_created_at: "2020-01-01T00:00:00.000Z",
  };

  await cleanupStaleFreeGameMessages({
    telegramClient: createFakeTelegramClient(calls),
    actualFreeGamesRepository: createRepositoryForActiveGame(game, calls),
    currentGameUuids: ["epic:listed-game"],
    enabledStores: ["epic"],
    allowCleanup: true,
  });

  assert.deepEqual(
    calls.map((call) => call.method),
    ["findActiveGamesMissingFromCurrent"],
  );
});

test("cleanup edits an old Epic message only when game is absent from listing", async () => {
  const calls = [];
  const game = {
    id: 2,
    uuid: "epic:missing-game",
    type: "epic",
    title: "Missing Game",
    link: "https://store.epicgames.com/ru/p/missing-game",
    chat_id: 123,
    telegram_message_id: 456,
    telegram_message_kind: "message",
    message_created_at: "2020-01-01T00:00:00.000Z",
  };

  await cleanupStaleFreeGameMessages({
    telegramClient: createFakeTelegramClient(calls),
    actualFreeGamesRepository: createRepositoryForActiveGame(game, calls),
    currentGameUuids: [],
    enabledStores: ["epic"],
    allowCleanup: true,
  });

  assert.deepEqual(
    calls.map((call) => call.method),
    ["findActiveGamesMissingFromCurrent", "editMessageText", "markGameEnded"],
  );
  assert.match(calls[1].payload.text, /Missing Game/);
  assert.equal(calls[2].id, 2);
});

test("cleanup deletes a fresh stale message when game is absent from listing", async () => {
  const calls = [];
  const game = {
    id: 3,
    uuid: "epic:fresh-missing-game",
    type: "epic",
    title: "Fresh Missing Game",
    chat_id: 123,
    telegram_message_id: 456,
    telegram_message_kind: "photo",
    message_created_at: new Date().toISOString(),
  };

  await cleanupStaleFreeGameMessages({
    telegramClient: createFakeTelegramClient(calls),
    actualFreeGamesRepository: createRepositoryForActiveGame(game, calls),
    currentGameUuids: [],
    enabledStores: ["epic"],
    allowCleanup: true,
  });

  assert.deepEqual(
    calls.map((call) => call.method),
    ["findActiveGamesMissingFromCurrent", "deleteMessage", "markGameDeleted"],
  );
  assert.deepEqual(calls[1].payload, {
    chatId: 123,
    messageId: 456,
  });
});

test("cleanup is skipped when cleanup is disabled", async () => {
  const calls = [];

  await cleanupStaleFreeGameMessages({
    telegramClient: createFakeTelegramClient(calls),
    actualFreeGamesRepository: createRepositoryForActiveGame({ uuid: "epic:any" }, calls),
    currentGameUuids: [],
    enabledStores: ["epic"],
    allowCleanup: false,
  });

  assert.deepEqual(calls, []);
});
