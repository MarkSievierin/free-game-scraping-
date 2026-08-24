function requireEnv(name, value) {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
}

function resolveTelegramConfig(env = process.env) {
  const appType = String(env.APP_TYPE || "").trim().toLowerCase();
  const useDevTelegramKeys = appType !== "prod";
  const botToken = useDevTelegramKeys ? env.BOT_TOKEN_DEV : env.BOT_TOKEN;
  const chatId = useDevTelegramKeys ? env.CHAT_ID_DEV : env.CHAT_ID;
  const botTokenEnvName = useDevTelegramKeys ? "BOT_TOKEN_DEV" : "BOT_TOKEN";
  const chatIdEnvName = useDevTelegramKeys ? "CHAT_ID_DEV" : "CHAT_ID";

  requireEnv(botTokenEnvName, botToken);
  requireEnv(chatIdEnvName, chatId);

  return {
    appType,
    useDevTelegramKeys,
    botToken,
    chatId,
  };
}

module.exports = {
  resolveTelegramConfig,
};
