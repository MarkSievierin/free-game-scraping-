require("dotenv").config();

const {
  getCurrentGameUuids,
  getKnownGameUuidsForStore,
  runFreeGames,
} = require("./src/application/run-free-games");
const { fetchGamesFromEnabledSources } = require("./src/application/source-fetcher");
const {
  resolveBooleanEnv,
  resolveMaxGamesLimit,
} = require("./src/config/runtime.config");

if (require.main === module) {
  runFreeGames().catch((error) => {
    console.error(`Fatal error: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  fetchGamesFromEnabledSources,
  getCurrentGameUuids,
  getKnownGameUuidsForStore,
  resolveBooleanEnv,
  resolveMaxGamesLimit,
};
