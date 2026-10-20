import { config } from "./config/index.js";
import { fomoWS } from "./core/fomo-ws.js";
import { discordBot } from "./discord/index.js";
import { copyTrader } from "./trader/index.js";
import { logger } from "./utils/logger.js";

async function bootstrap() {
  console.log(`
  ==============================================================
   🚀 FOMO & SOLANA UNIFIED BOT SUITE
  ==============================================================
   • Target Chain:       ${config.FOMO_CHAIN.toUpperCase()}
   • Copy-Trade Mode:    ${config.BOT_MODE.toUpperCase()}
   • Min Whale Size:     $${config.MIN_WHALE_TRADE_USD.toLocaleString()}
   • Copy-Trade Size:    ${config.COPY_TRADE_AMOUNT_SOL} SOL
   • Dynamic Slippage:   ${config.COPY_TRADE_SLIPPAGE_BPS / 100}%
   • Discord Bot:        ${config.DISCORD_BOT_TOKEN ? "ENABLED" : "DISABLED (Console Mock Mode)"}
  ==============================================================
  `);

  // 1. Start the Unified Discord Bot (Feeds + Slash Commands)
  await discordBot.start();

  // 2. Start the Jupiter On-Chain Copy-Trader
  await copyTrader.start();

  // 3. Connect to the Live FOMO WebSocket Stream
  fomoWS.connect();

  // Graceful Shutdown
  const shutdown = () => {
    logger.info("Shutting down FOMO Bot Suite...");
    fomoWS.disconnect();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

bootstrap().catch((err) => {
  logger.fatal({ err: err.message }, "Fatal error during bot initialization");
  process.exit(1);
});
