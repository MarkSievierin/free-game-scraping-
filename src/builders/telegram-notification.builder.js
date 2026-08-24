const { buildTelegramPhotoRequestDto } = require("../dto/telegram-photo-request.dto");
const { buildTelegramMessageRequestDto } = require("../dto/telegram-message-request.dto");

function escapeTelegramHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function truncateText(value, maxLength) {
  const normalizedValue = String(value || "").replace(/\s+/g, " ").trim();

  if (normalizedValue.length <= maxLength) {
    return normalizedValue;
  }

  return `${normalizedValue.slice(0, maxLength - 1).trimEnd()}...`;
}

function getStoreLabel(store) {
  const normalizedStore = String(store || "").trim().toLowerCase();

  if (normalizedStore === "epic") {
    return "Epic";
  }

  if (normalizedStore === "steam") {
    return "Steam";
  }

  return "";
}

function getChannelMention() {
  const username = String(process.env.TELEGRAM_CHANNEL_USERNAME || "")
    .trim()
    .replace(/^@+/, "");

  return username ? `@${username}` : "";
}

function buildGameCaption(game) {
  const storeLabel = getStoreLabel(game.store);
  const title = storeLabel ? `${game.title} | ${storeLabel}` : game.title;
  const offerEndsAt = String(game.offerEndsAt || "").trim() || "дату не видно, забирай скорее";
  const description = String(game.description || "").trim() || "Описание не найдено";
  const lines = [
    `<b>${escapeTelegramHtml(title)}</b>`,
    `Скидка: ${escapeTelegramHtml(game.discount)}`,
    `Цена: ${escapeTelegramHtml(game.price)}`,
    `Действует до: ${escapeTelegramHtml(offerEndsAt)}`,
  ];

  lines.push("");
  lines.push(escapeTelegramHtml(truncateText(description, 180)));

  const labels = [...(game.genres || []), ...(game.tags || [])]
    .filter(Boolean)
    .filter((label, index, array) => array.indexOf(label) === index)
    .slice(0, 5);

  if (labels.length > 0) {
    lines.push("");
    lines.push(labels.map((label) => `#${escapeTelegramHtml(label.replace(/\s+/g, "_"))}`).join(" "));
  }

  const channelMention = getChannelMention();
  if (channelMention) {
    lines.push("");
    lines.push(`🎮 Больше бесплатных игр — ${escapeTelegramHtml(channelMention)}`);
  }

  return lines.join("\n");
}

function buildClaimButtonMarkup(game) {
  if (!game.link) {
    return undefined;
  }

  const storeLabel = getStoreLabel(game.store);
  const buttonText = storeLabel ? `Забрать тут ${storeLabel}` : "Забрать тут";

  return {
    inline_keyboard: [
      [
        {
          text: buttonText,
          url: game.link,
        },
      ],
    ],
  };
}

function buildNoFreeGamesTelegramNotification({ chatId }) {
  const text = "Сегодня не нашел игр со скидкой -100%.";

  return {
    method: "message",
    dto: buildTelegramMessageRequestDto({
      chatId,
      text,
    }),
    logText: text,
  };
}

function buildFreeGamesTelegramNotifications({ chatId, games }) {
  return games.map((game) => {
    const caption = buildGameCaption(game);
    const replyMarkup = buildClaimButtonMarkup(game);

    if (game.imageUrl) {
      return {
        method: "photo",
        game,
        dto: buildTelegramPhotoRequestDto({
          chatId,
          photo: game.imageUrl,
          caption,
          parseMode: "HTML",
          replyMarkup,
        }),
        logText: caption,
        title: game.title,
      };
    }

    return {
      method: "message",
      game,
      dto: buildTelegramMessageRequestDto({
        chatId,
        text: caption,
        parseMode: "HTML",
        disableWebPagePreview: true,
        replyMarkup,
      }),
      logText: caption,
      title: game.title,
    };
  });
}

module.exports = {
  buildNoFreeGamesTelegramNotification,
  buildFreeGamesTelegramNotifications,
};
