const { buildTelegramMessageRequestDto } = require("../infrastructure/telegram/telegram-message.dto");
const { TelegramClient } = require("../infrastructure/telegram/telegram.client");

const MAX_STACK_LENGTH = 2500;

function escapeTelegramHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function normalizeError(error) {
  if (error instanceof Error) {
    return {
      message: error.message || error.name || "Unknown error",
      stack: error.stack || "",
    };
  }

  return {
    message: String(error || "Unknown error"),
    stack: "",
  };
}

function formatErrorContext(context) {
  if (!context || Object.keys(context).length === 0) {
    return "";
  }

  try {
    return JSON.stringify(context);
  } catch {
    return "Unable to serialize error context";
  }
}

function buildInternalErrorMessage({ scope, error, context } = {}) {
  const normalizedError = normalizeError(error);
  const contextText = formatErrorContext(context);
  const lines = [
    "⚠️ <b>Внутренняя ошибка stage</b>",
    "",
    `<b>Место:</b> ${escapeTelegramHtml(scope || "unknown")}`,
    `<b>Ошибка:</b> ${escapeTelegramHtml(normalizedError.message)}`,
  ];

  if (contextText) {
    lines.push(`<b>Контекст:</b> ${escapeTelegramHtml(contextText)}`);
  }

  if (normalizedError.stack) {
    lines.push("");
    lines.push(`<pre>${escapeTelegramHtml(normalizedError.stack.slice(0, MAX_STACK_LENGTH))}</pre>`);
  }

  return lines.join("\n");
}

function createErrorReporter({ env = process.env, telegramClient } = {}) {
  const appType = String(env.APP_TYPE || "").trim().toLowerCase();

  if (appType === "prod") {
    return async () => {};
  }

  const botToken = env.BOT_TOKEN_DEV;
  const chatId = env.CHAT_ID_DEV;
  const client = telegramClient || (botToken ? new TelegramClient({ botToken }) : null);

  return async ({ scope, error, context } = {}) => {
    if (!client || !chatId) {
      console.error("Stage error reporting is not configured: BOT_TOKEN_DEV or CHAT_ID_DEV is missing.");
      return;
    }

    const text = buildInternalErrorMessage({ scope, error, context });

    try {
      await client.sendMessage(
        buildTelegramMessageRequestDto({
          chatId,
          text,
          parseMode: "HTML",
          disableWebPagePreview: true,
        }),
      );
    } catch (reportingError) {
      console.error(`Stage error report failed: ${reportingError.message}`);
    }
  };
}

module.exports = {
  buildInternalErrorMessage,
  createErrorReporter,
};
