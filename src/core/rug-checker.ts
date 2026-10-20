import {
  fomoClient,
  TokenDevsResponse,
  TokenStatsResponse,
  TokenWarningsResponse,
} from "./fomo-client.js";
import { logger } from "../utils/logger.js";

export interface RiskAssessment {
  mint: string;
  isSafe: boolean;
  riskScore: number; // 0 (safest) to 100 (honeypot / fatal)
  level: "SAFE" | "CAUTION" | "DANGER";
  reasons: string[];
  warnings: TokenWarningsResponse;
  stats?: TokenStatsResponse;
  devs?: TokenDevsResponse;
}

export class RugChecker {
  /**
   * Evaluates a token's safety based on FOMO warnings, dev holdings, and liquidity flow
   */
  async assess(mint: string): Promise<RiskAssessment> {
    const reasons: string[] = [];
    let riskScore = 0;

    // Parallel fetch with error resilience
    const [warnings, stats, devs] = await Promise.all([
      fomoClient.getTokenWarnings(mint),
      fomoClient.getTokenStats(mint).catch(() => undefined),
      fomoClient.getTokenDevs(mint).catch(() => undefined),
    ]);

    // 1. Critical Honeypot / Transfer checks
    if (warnings.buyDisabled) {
      riskScore = 100;
      reasons.push("Buying is disabled by FOMO/contract");
    }
    if (warnings.sellDisabled) {
      riskScore = 100;
      reasons.push("Selling is disabled (Honeypot)");
    }
    if (warnings.tradingDisabled) {
      riskScore = 100;
      reasons.push("Trading is halted");
    }

    // 2. Severe warnings
    const severeWarnings =
      warnings.warnings?.filter((w) => w.severity === "SEVERE") || [];
    if (severeWarnings.length > 0) {
      riskScore = Math.max(riskScore, 85);
      severeWarnings.forEach((w) =>
        reasons.push(`[SEVERE] ${w.name}: ${w.description}`),
      );
    }

    // 3. Moderate warnings
    const moderateWarnings =
      warnings.warnings?.filter((w) => w.severity === "MODERATE") || [];
    if (moderateWarnings.length > 0) {
      riskScore += moderateWarnings.length * 15;
      moderateWarnings.forEach((w) =>
        reasons.push(`[MODERATE] ${w.name}: ${w.description}`),
      );
    }

    // 4. Dev holdings concentration
    if (devs?.devHoldingsPercent && devs.devHoldingsPercent > 15) {
      riskScore += 25;
      reasons.push(
        `High Dev allocation: ${devs.devHoldingsPercent}% of total supply`,
      );
    }

    // 5. Top 10 Holder concentration
    if (
      stats?.topHoldersConcentrationPercent &&
      stats.topHoldersConcentrationPercent > 65
    ) {
      riskScore += 20;
      reasons.push(
        `High Top-10 concentration: ${stats.topHoldersConcentrationPercent}%`,
      );
    }

    // Cap risk score between 0 and 100
    riskScore = Math.min(100, Math.max(0, riskScore));

    let level: "SAFE" | "CAUTION" | "DANGER" = "SAFE";
    if (riskScore >= 70) {
      level = "DANGER";
    } else if (riskScore >= 35) {
      level = "CAUTION";
    }

    const isSafe = riskScore < 45;

    logger.debug(
      { mint, riskScore, level, isSafe, reasonCount: reasons.length },
      "Risk assessment completed",
    );

    return {
      mint,
      isSafe,
      riskScore,
      level,
      reasons,
      warnings,
      stats,
      devs,
    };
  }
}

export const rugChecker = new RugChecker();
