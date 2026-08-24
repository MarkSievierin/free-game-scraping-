const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildFreeGamesTelegramNotifications,
} = require("../src/builders/telegram-notification.builder");

test("adds a subtle channel mention at the end of a game caption", () => {
  const previousUsername = process.env.TELEGRAM_CHANNEL_USERNAME;
  process.env.TELEGRAM_CHANNEL_USERNAME = "freegametest";

  try {
    const [notification] = buildFreeGamesTelegramNotifications({
      chatId: "-5193737797",
      games: [
        {
          store: "epic",
          title: "Cardpocalypse",
          discount: "-100%",
          price: "Бесплатно",
          offerEndsAt: "27.08.2026 в 17:00",
          description: "Описание игры",
          tags: ["Game"],
          link: "https://store.epicgames.com/ru/p/cardpocalypse",
        },
      ],
    });

    assert.match(notification.dto.text, /#Game\n\n🎮 Больше бесплатных игр — @freegametest$/u);
  } finally {
    if (previousUsername === undefined) {
      delete process.env.TELEGRAM_CHANNEL_USERNAME;
    } else {
      process.env.TELEGRAM_CHANNEL_USERNAME = previousUsername;
    }
  }
});
