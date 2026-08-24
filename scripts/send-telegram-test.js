require("dotenv").config();

const { TelegramClient } = require("../src/infrastructure/telegram/telegram.client");
const { sendTelegramNotifications } = require("../src/application/send-telegram-notifications");
const { resolveTelegramConfig } = require("../src/config/telegram.config");
const { buildFreeGamesTelegramNotifications } = require("../src/presentation/telegram/notification.builder");

async function main() {
  const { botToken, chatId } = resolveTelegramConfig();
  const telegramClient = new TelegramClient({ botToken });

  const games = [
    {
      store: "steam",
      title: "Nocturnal",
      discount: "-100%",
      price: "0.00 EUR",
      offerEndsAt: "26 апреля 2026",
      link: "https://store.steampowered.com/app/1634080/Nocturnal/?snr=1_7_7_2300_150_1",
      imageUrl: "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/1634080/header.jpg",
      description:
        "Carve your way with fire and steel to find out what secrets lie beyond the Mist in this intense action-platformer.",
      genres: ["Экшены", "Приключения"],
      tags: ["Вид_сбоку", "Повествование", "Исследования"],
    },
  ];

  const notifications = buildFreeGamesTelegramNotifications({ chatId, games });
  await sendTelegramNotifications({ telegramClient, notifications });
}

main().catch((error) => {
  console.error(`Telegram test failed: ${error.message}`);
  process.exitCode = 1;
});
