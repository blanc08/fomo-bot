import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { config } from "../config/index.js";
import { fomoClient } from "../core/fomo-client.js";
import { BaseAlert, fomoWS } from "../core/fomo-ws.js";
import { jupiter, SOL_MINT } from "../core/jupiter.js";
import { rugChecker } from "../core/rug-checker.js";
import { solana } from "../core/solana.js";
import { logger } from "../utils/logger.js";

export interface ActivePosition {
  tokenAddress: string;
  tokenSymbol: string;
  trader: string;
  entryTimestamp: number;
  solSpent: number;
  tokensBought: number;
  txid: string;
}

export class CopyTraderEngine {
  private targetTraders: Set<string> = new Set();
  private activePositions = new Map<string, ActivePosition>();
  private isRunning = false;

  constructor() {
    config.COPY_TRADE_TARGET_HANDLES.forEach((h) => this.targetTraders.add(h));
  }

  async start() {
    this.isRunning = true;
    logger.info(
      {
        mode: config.BOT_MODE.toUpperCase(),
        amountSol: config.COPY_TRADE_AMOUNT_SOL,
        slippageBps: config.COPY_TRADE_SLIPPAGE_BPS,
      },
      "⚡ On-Chain Copy-Trading Engine initialized",
    );

    // If no manual trader handles provided, auto-load top 5 from 30d leaderboard
    if (this.targetTraders.size === 0) {
      await this.loadTopTradersFromLeaderboard();
    } else {
      logger.info(
        { targets: Array.from(this.targetTraders) },
        "Monitoring configured target traders",
      );
    }

    fomoWS.on("buy", (alert: BaseAlert) => this.handleBuy(alert));
    fomoWS.on("sell", (alert: BaseAlert) => this.handleSell(alert));
  }

  private async loadTopTradersFromLeaderboard() {
    try {
      logger.info("Fetching top 5 traders from FOMO 30-day leaderboard...");
      const response = await fomoClient.getLeaderboard("30d", 5);
      const leadersList: any[] = Array.isArray(response)
        ? response
        : (response as any)?.traders || [];

      if (leadersList.length > 0) {
        leadersList.forEach((l) => {
          const handle = l.handle || l.trader || l.username;
          if (handle)
            this.targetTraders.add(handle.toLowerCase().replace(/^@/, ""));
        });
        logger.info(
          {
            count: this.targetTraders.size,
            targets: Array.from(this.targetTraders),
          },
          "✅ Auto-populated target traders from leaderboard",
        );
      }
    } catch (err: any) {
      logger.warn(
        { err: err.message },
        "Could not load leaderboard, copy-trader waiting for targets",
      );
    }
  }

  private isTarget(traderHandle?: string): boolean {
    if (!traderHandle) return false;
    const clean = traderHandle.toLowerCase().replace(/^@/, "");
    return this.targetTraders.has(clean);
  }

  private async handleBuy(alert: BaseAlert) {
    if (!this.isRunning || !alert.tokenAddress) return;
    if (!this.isTarget(alert.trader)) return;

    logger.info(
      {
        trader: alert.trader,
        token: alert.token,
        mint: alert.tokenAddress,
        sizeUsd: alert.tradeUsd,
      },
      "🎯 TARGET TRADER BUY DETECTED! Preparing copy-trade...",
    );

    // 1. Pre-flight Safety Assessment (Rug-Check)
    const risk = await rugChecker.assess(alert.tokenAddress);
    if (!risk.isSafe) {
      logger.warn(
        {
          mint: alert.tokenAddress,
          score: risk.riskScore,
          reasons: risk.reasons,
        },
        "❌ COPY-TRADE ABORTED: Token failed safety pre-flight check!",
      );
      return;
    }

    // 2. Prevent duplicate buy if already in position
    if (this.activePositions.has(alert.tokenAddress)) {
      logger.info(
        { mint: alert.tokenAddress },
        "Already holding position for this token. Skipping additional buy.",
      );
      return;
    }

    // 3. Request Jupiter Quote
    const amountLamports = Math.floor(
      config.COPY_TRADE_AMOUNT_SOL * LAMPORTS_PER_SOL,
    );
    const quote = await jupiter.getQuote(
      SOL_MINT,
      alert.tokenAddress,
      amountLamports,
      config.COPY_TRADE_SLIPPAGE_BPS,
    );

    if (!quote) {
      logger.error(
        { mint: alert.tokenAddress },
        "Could not obtain swap quote from Jupiter",
      );
      return;
    }

    // 4. Execute Swap (Simulation or Live)
    const swapResult = await jupiter.executeSwap(quote);

    if (swapResult.success) {
      const position: ActivePosition = {
        tokenAddress: alert.tokenAddress,
        tokenSymbol: alert.token || "TOKEN",
        trader: alert.trader || "unknown",
        entryTimestamp: Date.now(),
        solSpent: config.COPY_TRADE_AMOUNT_SOL,
        tokensBought: swapResult.outAmount,
        txid: swapResult.txid || "",
      };

      this.activePositions.set(alert.tokenAddress, position);

      logger.info(
        {
          token: position.tokenSymbol,
          mint: position.tokenAddress,
          solSpent: position.solSpent,
          tokens: position.tokensBought,
          simulated: swapResult.simulated,
        },
        "✅ Copy-trade entered successfully!",
      );
    }
  }

  private async handleSell(alert: BaseAlert) {
    if (!this.isRunning || !alert.tokenAddress) return;
    if (!this.isTarget(alert.trader)) return;

    const position = this.activePositions.get(alert.tokenAddress);
    if (!position) {
      return;
    }

    logger.info(
      { trader: alert.trader, token: position.tokenSymbol },
      "🎯 TARGET TRADER SOLD: Mirroring exit swap on Jupiter...",
    );

    // Get current balance
    let tokenBalanceLamports = position.tokensBought;
    if (!solana.isSimulation) {
      const realBalance = await solana.getTokenBalance(alert.tokenAddress);
      if (realBalance <= 0) {
        logger.warn("Token balance is 0 on-chain. Removing tracked position.");
        this.activePositions.delete(alert.tokenAddress);
        return;
      }
      tokenBalanceLamports = realBalance;
    }

    // Request quote: Token -> SOL
    const quote = await jupiter.getQuote(
      alert.tokenAddress,
      SOL_MINT,
      tokenBalanceLamports.toString(),
      config.COPY_TRADE_SLIPPAGE_BPS,
    );

    if (!quote) {
      logger.error("Failed to get exit quote from Jupiter");
      return;
    }

    // Execute exit swap
    const exitResult = await jupiter.executeSwap(quote);
    if (exitResult.success) {
      const solReceived = exitResult.outAmount / LAMPORTS_PER_SOL;
      const profitSol = solReceived - position.solSpent;
      const profitPercent = ((profitSol / position.solSpent) * 100).toFixed(2);

      logger.info(
        {
          token: position.tokenSymbol,
          solSpent: position.solSpent,
          solReceived,
          profitSol,
          profitPercent: `${profitPercent}%`,
          simulated: exitResult.simulated,
        },
        "🏁 Position closed and mirrored successfully!",
      );

      this.activePositions.delete(alert.tokenAddress);
    }
  }

  getActivePositions(): ActivePosition[] {
    return Array.from(this.activePositions.values());
  }
}

export const copyTrader = new CopyTraderEngine();
