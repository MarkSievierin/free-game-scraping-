const {
  all,
  close,
  get,
  openDatabase,
  run,
} = require("./mysql.client");
const { normalizeStore, buildGameUuid } = require("../../domain/free-game");
const { normalizeServerType } = require("../../config/runtime.config");

function buildSqlPlaceholders(values) {
  return values.map(() => "?").join(", ");
}

async function createActualFreeGamesRepository({ serverType } = {}) {
  const normalizedServerType = normalizeServerType(serverType);
  const database = await openDatabase();
  const actualFreeGameTable = await get(
    database,
    "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'actual_free_game' LIMIT 1",
  );

  if (!actualFreeGameTable) {
    await close(database);
    throw new Error("Database is not initialized. Run `npm run setup:db` first.");
  }

  return {
    async isKnownGame(game) {
      const uuid = buildGameUuid(game);

      if (!uuid) {
        return false;
      }

      const row = await get(
        database,
        `SELECT id
         FROM actual_free_game
         WHERE uuid = ?
           AND server_type = ?
           AND status = 'active'
           AND telegram_message_id IS NOT NULL
         LIMIT 1`,
        [uuid, normalizedServerType],
      );

      return Boolean(row);
    },
    async filterNewGames(games) {
      const freshGames = [];

      for (const game of games) {
        if (!(await this.isKnownGame(game))) {
          freshGames.push(game);
        }
      }

      return freshGames;
    },
    async getKnownGameUuidsByType() {
      const rows = await all(
        database,
        `SELECT uuid, type
         FROM actual_free_game
         WHERE server_type = ?
           AND status = 'active'
           AND telegram_message_id IS NOT NULL`,
        [normalizedServerType],
      );
      const grouped = {
        steam: new Set(),
        gog: new Set(),
        epic: new Set(),
      };

      for (const row of rows) {
        const type = normalizeStore(row.type);

        if (!grouped[type]) {
          grouped[type] = new Set();
        }

        grouped[type].add(String(row.uuid || "").trim());
      }

      return grouped;
    },
    async markGamesSeen(games) {
      for (const game of games) {
        const uuid = buildGameUuid(game);

        if (!uuid) {
          continue;
        }

        await run(
          database,
          `UPDATE actual_free_game
           SET last_seen_at = CURRENT_TIMESTAMP
           WHERE uuid = ? AND server_type = ? AND status = 'active'`,
          [uuid, normalizedServerType],
        );
      }
    },
    async markGameUuidsSeen(gameUuids) {
      const uuids = [...new Set((gameUuids || []).map((uuid) => String(uuid || "").trim()).filter(Boolean))];

      for (const uuid of uuids) {
        await run(
          database,
          `UPDATE actual_free_game
           SET last_seen_at = CURRENT_TIMESTAMP
           WHERE uuid = ? AND server_type = ? AND status = 'active'`,
          [uuid, normalizedServerType],
        );
      }
    },
    async findActiveGamesMissingFromCurrent({ currentGameUuids, enabledStores }) {
      const stores = [...new Set((enabledStores || []).map(normalizeStore).filter(Boolean))];
      const uuids = [...new Set((currentGameUuids || []).map((uuid) => String(uuid || "").trim()).filter(Boolean))];

      if (stores.length === 0) {
        return [];
      }

      const params = [normalizedServerType, ...stores];
      let sql = `
        SELECT id, uuid, type, title, link, chat_id, telegram_message_id, telegram_message_kind, message_created_at, created_at
        FROM actual_free_game
        WHERE server_type = ?
          AND status = 'active'
          AND telegram_message_id IS NOT NULL
          AND chat_id IS NOT NULL
          AND type IN (${buildSqlPlaceholders(stores)})
      `;

      if (uuids.length > 0) {
        sql += ` AND uuid NOT IN (${buildSqlPlaceholders(uuids)})`;
        params.push(...uuids);
      }

      return all(database, sql, params);
    },
    async saveGame(game, { telegramMessage, messageKind, chatId } = {}) {
      const uuid = buildGameUuid(game);
      const type = normalizeStore(game.store);
      const messageId = telegramMessage?.message_id;

      if (!uuid || !type) {
        return false;
      }

      await run(
        database,
        `INSERT INTO actual_free_game (
           uuid,
           type,
           server_type,
           title,
           link,
           discount_ends_at,
           chat_id,
           telegram_message_id,
           telegram_message_kind,
           status,
           last_seen_at,
           message_created_at,
           created_at
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         ON DUPLICATE KEY UPDATE
           title = VALUES(title),
           link = VALUES(link),
           discount_ends_at = VALUES(discount_ends_at),
           chat_id = VALUES(chat_id),
           telegram_message_id = VALUES(telegram_message_id),
           telegram_message_kind = VALUES(telegram_message_kind),
           status = 'active',
           last_seen_at = CURRENT_TIMESTAMP,
           message_created_at = COALESCE(message_created_at, CURRENT_TIMESTAMP),
           ended_at = NULL`,
        [
          uuid,
          type,
          normalizedServerType,
          String(game.title || "").trim(),
          String(game.link || "").trim(),
          String(game.offerEndsAt || "").trim(),
          chatId || null,
          messageId || null,
          messageKind || null,
        ],
      );

      return true;
    },
    async saveNotifications(notifications) {
      for (const notification of notifications) {
        await this.saveGame(notification.game, {
          telegramMessage: notification.telegramMessage,
          messageKind: notification.method,
          chatId: notification.telegramMessage?.chat?.id,
        });
      }
    },
    async saveGames(games) {
      for (const game of games) {
        await this.saveGame(game);
      }
    },
    async markGameDeleted(id) {
      await run(
        database,
        `UPDATE actual_free_game
         SET status = 'deleted', ended_at = CURRENT_TIMESTAMP
         WHERE id = ? AND server_type = ?`,
        [id, normalizedServerType],
      );
    },
    async markGameEnded(id) {
      await run(
        database,
        `UPDATE actual_free_game
         SET status = 'ended', ended_at = CURRENT_TIMESTAMP
         WHERE id = ? AND server_type = ?`,
        [id, normalizedServerType],
      );
    },
    async markGameDeleteFailed(id) {
      await run(
        database,
        `UPDATE actual_free_game
         SET status = 'delete_failed', ended_at = CURRENT_TIMESTAMP
         WHERE id = ? AND server_type = ?`,
        [id, normalizedServerType],
      );
    },
    async markGameEditFailed(id) {
      await run(
        database,
        `UPDATE actual_free_game
         SET status = 'edit_failed', ended_at = CURRENT_TIMESTAMP
         WHERE id = ? AND server_type = ?`,
        [id, normalizedServerType],
      );
    },
    async close() {
      await close(database);
    },
  };
}

module.exports = {
  createActualFreeGamesRepository,
};
