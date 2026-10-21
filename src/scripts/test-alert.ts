import { config } from "../config/index.js";
import { BaseAlert, fomoWS } from "../core/fomo-ws.js";
import { discordBot } from "../discord/index.js";
import { copyTrader } from "../trader/index.js";
import { logger } from "../utils/logger.js";

const JUP_MINT = "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN";
const BONK_MINT = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";

export function createMockAlert(
  type: "buy" | "sell" | "thesis" | "copytrade",
  traderOverride?: string,
): BaseAlert {
  const now = Date.now();
  switch (type) {
    case "buy":
      return {
        type: "buy",
        eventId: `test_buy_${now}`,
        tradeId: `trade_${now}`,
        token: "JUP",
        tokenAddress: JUP_MINT,
        chain: "solana",
        trader: traderOverride || "whale_watcher",
        tradeUsd: 15500,
        positionValueUsd: 48000,
        ts: now,
        txHash: "5KtPnExAmpLeTxHaSh11111111111111111111111111",
      };
    case "sell":
      return {
        type: "sell",
        eventId: `test_sell_${now}`,
        tradeId: `trade_${now}`,
        token: "BONK",
        tokenAddress: BONK_MINT,
        chain: "solana",
        trader: traderOverride || "diamond_hands",
        tradeUsd: 28500,
        realizedPnlUsd: 11200,
        ts: now,
        txHash: "3QvYExAmpLeTxHaSh22222222222222222222222222",
      };
    case "thesis":
      return {
        type: "thesis",
        eventId: `test_thesis_${now}`,
        token: "JUP",
        tokenAddress: JUP_MINT,
        chain: "solana",
        trader: traderOverride || "sol_analyst",
        thesisText:
          "Massive institutional volume rotating into $JUP after LFG launchpad upgrade announcement. Breakout confirmed above key 200 EMA with expanding open interest.",
        ts: now,
      };
    case "copytrade":
      return {
        type: "buy",
        eventId: `test_copy_${now}`,
        tradeId: `trade_${now}`,
        token: "JUP",
        tokenAddress: JUP_MINT,
        chain: "solana",
        trader: traderOverride || "exacttalltakin",
        tradeUsd: 8200,
        ts: now,
      };
  }
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const testType = (process.argv[2] || "all").toLowerCase();

  console.log(`
  ==============================================================
   🧪 FOMO BOT ALERT SIMULATOR & TEST HARNESS
  ==============================================================
   • Mode:        ${testType.toUpperCase()}
   • Discord Bot: ${config.DISCORD_BOT_TOKEN ? "ENABLED" : "CONSOLE MOCK"}
   • Copy-Trader: ${config.BOT_MODE.toUpperCase()}
  ==============================================================
  `);

  // Initialize Discord Bot
  await discordBot.start();

  // Initialize Copy-Trader Engine
  await copyTrader.start();

  // Wait 1.5s for connections to be fully established
  await sleep(1500);

  // 1. Whale Buy Alert
  if (testType === "all" || testType === "whale_buy" || testType === "buy") {
    logger.info("🧪 Emitting Test Alert: WHALE BUY ($15,500 JUP)...");
    const buyAlert = createMockAlert("buy");
    fomoWS.emit("buy", buyAlert);
    await sleep(2000);
  }

  // 2. Whale Sell Alert
  if (testType === "all" || testType === "whale_sell" || testType === "sell") {
    logger.info("🧪 Emitting Test Alert: WHALE SELL ($28,500 BONK)...");
    const sellAlert = createMockAlert("sell");
    fomoWS.emit("sell", sellAlert);
    await sleep(2000);
  }

  // 3. Alpha Thesis Alert
  if (testType === "all" || testType === "thesis") {
    logger.info("🧪 Emitting Test Alert: ALPHA THESIS (with AI scoring)...");
    const thesisAlert = createMockAlert("thesis");
    fomoWS.emit("thesis", thesisAlert);
    await sleep(2000);
  }

  // 4. Narrative Spike (3 consecutive theses by distinct traders on same token)
  if (testType === "all" || testType === "spike") {
    logger.info(
      "🧪 Emitting Test Alert: NARRATIVE SPIKE (3 theses in 1 hour)...",
    );
    const traders = ["alpha_hunter", "crypto_sage", "chart_wizard"];
    for (const trader of traders) {
      const spikeThesis = createMockAlert("thesis", trader);
      fomoWS.emit("thesis", spikeThesis);
      await sleep(1000);
    }
    await sleep(1500);
  }

  // 5. Copy-Trade Buy Trigger
  if (testType === "all" || testType === "copytrade") {
    // Determine target trader from config or default top trader
    const targetTrader =
      config.COPY_TRADE_TARGET_HANDLES[0] || "exacttalltakin";

    logger.info(
      { trader: targetTrader },
      "🧪 Emitting Test Alert: COPY-TRADE BUY (Simulating target trader buy)...",
    );
    const copyAlert = createMockAlert("copytrade", targetTrader);
    fomoWS.emit("buy", copyAlert);
    await sleep(3500);
  }

  logger.info(
    "✅ Test alert sequence completed. Check your Discord channels and logs above!",
  );

  // Keep alive for 2 seconds to flush Discord queues, then exit
  await sleep(2000);
  process.exit(0);
}

main().catch((err) => {
  logger.error({ err: err.message }, "Error during test alert simulation");
  process.exit(1);
});
