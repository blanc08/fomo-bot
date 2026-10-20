import { config } from "../config/index.js";
import { logger } from "../utils/logger.js";
import { cache } from "./cache.js";

export interface TokenWarning {
  name: string;
  description: string;
  severity: "INFO" | "MODERATE" | "SEVERE";
  type: string;
}

export interface TokenWarningsResponse {
  address: string;
  allowlisted?: boolean;
  buyDisabled?: boolean;
  sellDisabled?: boolean;
  tradingDisabled?: boolean;
  warnings?: TokenWarning[];
}

export interface TraderProfileResponse {
  handle: string;
  userId?: string;
  accountAgeDays?: number;
  wallets?: {
    mainSolana?: string;
    mainEvm?: string;
    status?: "resolving" | "verified";
  };
  pnl?: {
    realized30dUsd?: number;
    winRatePercent?: number;
    totalTrades?: number;
    volume30dUsd?: number;
  };
}

export interface TokenStatsResponse {
  address: string;
  volumeUsd?: {
    m5?: number;
    h1?: number;
    h24?: number;
  };
  buyCount?: {
    m5?: number;
    h1?: number;
    h24?: number;
  };
  sellCount?: {
    m5?: number;
    h1?: number;
    h24?: number;
  };
  topHoldersConcentrationPercent?: number;
}

export interface TokenDevsResponse {
  address: string;
  devHoldingsPercent?: number;
  hasDevSold?: boolean;
  devs?: Array<{
    address?: string;
    holdingPercent?: number;
    thesis?: string;
  }>;
}

export class FomoClient {
  private baseUrl: string;
  private apiKey: string;
  public totalCreditsUsed = 0;
  public lastCreditsRemaining: number | null = null;

  constructor() {
    this.baseUrl = config.FOMO_REST_BASE_URL.replace(/\/$/, "");
    this.apiKey = config.FOMO_API_KEY;
  }

  private async request<T>(
    path: string,
    options: RequestInit = {},
  ): Promise<T> {
    const url = `${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(options.headers as Record<string, string>),
    };

    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
      headers["X-API-Key"] = this.apiKey;
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    // Track credits
    const costHeader = response.headers.get("x-credits-cost");
    const remainingHeader = response.headers.get("x-credits-remaining");

    if (costHeader) {
      const cost = parseInt(costHeader, 10);
      if (!isNaN(cost)) {
        this.totalCreditsUsed += cost;
        logger.debug(
          { path, cost, totalUsed: this.totalCreditsUsed },
          "Credits billed",
        );
      }
    }

    if (remainingHeader) {
      const remaining = parseInt(remainingHeader, 10);
      if (!isNaN(remaining)) {
        this.lastCreditsRemaining = remaining;
        if (remaining < 25000) {
          logger.warn({ remaining }, "⚠️ FOMO API credits are running low!");
        }
      }
    }

    if (!response.ok) {
      if (response.status === 402) {
        logger.error(
          "❌ FOMO API 402: Credits exhausted! Please top up your plan.",
        );
      } else if (response.status === 401) {
        logger.error(
          "❌ FOMO API 401: Unauthorized. Please check your FOMO_API_KEY.",
        );
      }
      const errorText = await response.text();
      throw new Error(
        `FOMO API HTTP ${response.status} on ${path}: ${errorText}`,
      );
    }

    return (await response.json()) as T;
  }

  /**
   * Coin warnings FOMO shows before a trade.
   * Checks honeypots, unsellable tokens, transfer fees, etc.
   * Cost: 250 credits (cached for 10 min)
   */
  async getTokenWarnings(
    address: string,
    networkId = "solana",
  ): Promise<TokenWarningsResponse> {
    const cached = cache.getTokenWarnings(address);
    if (cached) return cached;

    try {
      const data = await this.request<TokenWarningsResponse>(
        `/v2/token/${address}/warnings?networkId=${networkId}`,
      );
      cache.setTokenWarnings(address, data);
      return data;
    } catch (err: any) {
      logger.warn(
        { address, err: err.message },
        "Failed to fetch token warnings",
      );
      return { address, warnings: [] };
    }
  }

  /**
   * Deployer and insider holdings.
   * Cost: 250 credits
   */
  async getTokenDevs(
    address: string,
    networkId = "solana",
  ): Promise<TokenDevsResponse> {
    return this.request<TokenDevsResponse>(
      `/v2/token/${address}/devs?networkId=${networkId}`,
    );
  }

  /**
   * Buy/sell flow and holder concentration.
   * Cost: 250 credits (cached for 5 min)
   */
  async getTokenStats(
    address: string,
    networkId = "solana",
  ): Promise<TokenStatsResponse> {
    const cached = cache.getTokenStats(address);
    if (cached) return cached;

    const data = await this.request<TokenStatsResponse>(
      `/v2/token/${address}/stats?networkId=${networkId}`,
    );
    cache.setTokenStats(address, data);
    return data;
  }

  /**
   * Resolve a trader handle: wallets, PnL, stats.
   * Cost: 2,500 credits (cached for 1 hour)
   */
  async getTraderProfile(
    handle: string,
  ): Promise<TraderProfileResponse | null> {
    const cleanHandle = handle.replace(/^@/, "");
    const cached = cache.getTraderProfile(cleanHandle);
    if (cached) return cached;

    try {
      const data = await this.request<TraderProfileResponse>(
        `/v2/users/${cleanHandle}`,
      );
      cache.setTraderProfile(cleanHandle, data);
      return data;
    } catch (err: any) {
      logger.warn(
        { handle, err: err.message },
        "Failed to resolve trader profile",
      );
      return null;
    }
  }

  /**
   * Top ranked traders by PnL.
   * Cost: 250 credits
   */
  async getLeaderboard(
    window: "24h" | "7d" | "30d" | "all" = "30d",
    limit = 20,
  ) {
    return this.request<any[]>(`/v2/leaderboard/${window}?limit=${limit}`);
  }

  /**
   * Token board: graduated tokens from bonding curves.
   * Cost: 250 credits
   */
  async getGraduatedTokens(limit = 20) {
    return this.request<any[]>(
      `/v2/leaderboard/tokens/graduated?limit=${limit}`,
    );
  }

  /**
   * Global theses feed across all coins.
   * Cost: 1,250 credits
   */
  async getTheses(limit = 25, chain = "solana") {
    return this.request<any[]>(`/v2/thesis?limit=${limit}&chain=${chain}`);
  }
}

export const fomoClient = new FomoClient();
