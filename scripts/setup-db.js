require("dotenv").config();

const fs = require("fs");
const path = require("path");
const {
  all,
  close,
  exec,
  openDatabase,
  resolveMysqlConfig,
  run,
} = require("../src/infrastructure/database/mysql.client");

const MIGRATIONS_DIRECTORY = path.resolve(__dirname, "..", "migrations");

async function ensureMigrationsTable(database) {
  await run(
    database,
    `CREATE TABLE IF NOT EXISTS migrations (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
  );
}

function loadMigrationFiles() {
  return fs
    .readdirSync(MIGRATIONS_DIRECTORY)
    .filter((fileName) => fileName.endsWith(".sql"))
    .sort()
    .map((fileName) => ({
      name: fileName,
      sql: fs.readFileSync(path.join(MIGRATIONS_DIRECTORY, fileName), "utf8"),
    }));
}

async function getAppliedMigrationNames(database) {
  const rows = await all(database, "SELECT name FROM migrations ORDER BY id ASC");
  return new Set(rows.map((row) => String(row.name || "").trim()));
}

async function applyMigration(database, migration) {
  await run(database, "START TRANSACTION");

  try {
    await exec(database, migration.sql);
    await run(database, "INSERT INTO migrations (name) VALUES (?)", [migration.name]);
    await run(database, "COMMIT");
  } catch (error) {
    await run(database, "ROLLBACK").catch(() => {});
    throw error;
  }
}

async function main() {
  const databaseConfig = resolveMysqlConfig();
  const database = await openDatabase();

  try {
    await ensureMigrationsTable(database);
    const appliedMigrationNames = await getAppliedMigrationNames(database);
    const migrations = loadMigrationFiles();

    for (const migration of migrations) {
      if (appliedMigrationNames.has(migration.name)) {
        continue;
      }

      await applyMigration(database, migration);
      console.log(`Applied migration: ${migration.name}`);
    }

    console.log(`Database is ready: ${databaseConfig.database}@${databaseConfig.host}:${databaseConfig.port}`);
  } finally {
    await close(database);
  }
}

main().catch((error) => {
  console.error(`Database setup failed: ${error.message}`);
  process.exitCode = 1;
});
