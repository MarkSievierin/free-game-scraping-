const { resolveRuntimeConfig } = require("../config/runtime.config");
const { resolveTelegramConfig } = require("../config/telegram.config");
const { createActualFreeGamesRepository } = require("../infrastructure/database/actual-free-game.repository");
const { TelegramClient } = require("../infrastructure/telegram/telegram.client");
const { buildFreeGamesTelegramNotifications } = require("../presentation/telegram/notification.builder");
const { cleanupStaleFreeGameMessages } = require("./cleanup-stale-free-game-messages");
const { createErrorReporter } = require("./error-reporter");
const { sendTelegramNotifications } = require("./send-telegram-notifications");
const {
  countKnownGameUuids,
  fetchGamesFromEnabledSources,
  getCurrentGameUuids,
  getKnownGameUuidsForStore,
} = require("./source-fetcher");

async function runFreeGames({ env = process.env } = {}) {
  const reportError = createErrorReporter({ env });
  let actualFreeGamesRepository;
  let phase = "configuration";

  try {
    const runtimeConfig = resolveRuntimeConfig(env);
    const { appType, botToken, chatId } = resolveTelegramConfig(env);
    phase = "database.open";
    actualFreeGamesRepository = await createActualFreeGamesRepository({
      serverType: runtimeConfig.serverType,
    });
    const telegramClient = new TelegramClient({ botToken });
    phase = "database.read-known-games";
    const knownGameUuidsByType = await actualFreeGamesRepository.getKnownGameUuidsByType();
    console.log(
      `Run config: appType=${appType || "(empty)"}, serverType=${runtimeConfig.serverType}, ` +
        `epic=${runtimeConfig.enableEpic}, steam=${runtimeConfig.enableSteam}, ` +
        `maxGames=${runtimeConfig.maxGames || "all"}, ` +
        `sentKnown=${JSON.stringify(countKnownGameUuids(knownGameUuidsByType))}`,
    );

    phase = "sources.fetch";
    const { games, currentGameUuids } = await fetchGamesFromEnabledSources({
      maxGames: runtimeConfig.maxGames,
      enableEpic: runtimeConfig.enableEpic,
      enableSteam: runtimeConfig.enableSteam,
      knownGameUuidsByType,
    });
    console.log(
      `Fetched games: current=${currentGameUuids.length}, candidatesToSend=${games.length}`,
    );

    if (games.length === 0 && currentGameUuids.length === 0) {
      console.log("No free games found.");
      return;
    }

    const enabledStores = [
      runtimeConfig.enableEpic ? "epic" : "",
      runtimeConfig.enableSteam ? "steam" : "",
    ].filter(Boolean);

    phase = "database.mark-seen";
    await actualFreeGamesRepository.markGameUuidsSeen(currentGameUuids);
    phase = "telegram.cleanup";
    await cleanupStaleFreeGameMessages({
      telegramClient,
      actualFreeGamesRepository,
      currentGameUuids,
      enabledStores,
      allowCleanup: !runtimeConfig.maxGames,
      reportError,
    });

    if (games.length === 0) {
      console.log("No new free games to send.");
      return;
    }

    phase = "database.filter-new-games";
    const gamesToSend = await actualFreeGamesRepository.filterNewGames(games);

    if (gamesToSend.length === 0) {
      console.log("No new free games to send.");
      return;
    }

    phase = "telegram.send";
    const notifications = buildFreeGamesTelegramNotifications({ chatId, games: gamesToSend });
    const successfulNotifications = await sendTelegramNotifications({
      telegramClient,
      notifications,
      reportError,
    });

    phase = "database.save-notifications";
    await actualFreeGamesRepository.saveNotifications(successfulNotifications);
  } catch (error) {
    await reportError({
      scope: "application.run",
      error,
      context: { phase },
    });
    throw error;
  } finally {
    if (actualFreeGamesRepository) {
      try {
        await actualFreeGamesRepository.close();
      } catch (error) {
        await reportError({
          scope: "database.close",
          error,
        });
        throw error;
      }
    }
  }
}

module.exports = {
  getCurrentGameUuids,
  getKnownGameUuidsForStore,
  runFreeGames,
};
