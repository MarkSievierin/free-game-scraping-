const mysql = require("mysql2/promise");

function resolveMysqlConfig(env = process.env) {
  return {
    host: String(env.MYSQL_HOST || "127.0.0.1").trim(),
    port: Number.parseInt(String(env.MYSQL_PORT || "3306").trim(), 10),
    user: String(env.MYSQL_USER || "").trim(),
    password: String(env.MYSQL_PASSWORD || ""),
    database: String(env.MYSQL_DATABASE || "").trim(),
    multipleStatements: true,
    charset: "utf8mb4",
    timezone: "Z",
  };
}

function requireMysqlConfig(config) {
  if (!config.user) {
    throw new Error("Missing required environment variable: MYSQL_USER");
  }

  if (!config.database) {
    throw new Error("Missing required environment variable: MYSQL_DATABASE");
  }
}

async function openDatabase() {
  const config = resolveMysqlConfig();
  requireMysqlConfig(config);

  return mysql.createConnection(config);
}

async function run(database, sql, params = []) {
  const [result] = await database.execute(sql, params);
  return result;
}

async function exec(database, sql) {
  const [result] = await database.query(sql);
  return result;
}

async function get(database, sql, params = []) {
  const [rows] = await database.execute(sql, params);
  return rows[0];
}

async function all(database, sql, params = []) {
  const [rows] = await database.execute(sql, params);
  return rows;
}

async function close(database) {
  await database.end();
}

module.exports = {
  all,
  close,
  exec,
  get,
  openDatabase,
  resolveMysqlConfig,
  run,
};
