import { EventEmitter } from "events";
import WebSocket from "ws";
import { config } from "../config/index.js";
import { logger } from "../utils/logger.js";

export interface BaseAlert {
  type: "buy" | "sell" | "thesis" | "perp";
  eventId?: string;
  token?: string; // Symbol
  tokenAddress?: string; // Mint / contract address
  chain?: string;
  chainId?: number;
  trader?: string; // Handle
  userId?: string;
  tradeUsd?: number; // Size of fill
  positionValueUsd?: number;
  realizedPnlUsd?: number; // Cumulative for position
  tradeId?: string;
  ts?: number;
  source?: string;
  avatarUrl?: string | null;
  tokenImageUrl?: string | null;
  thesisText?: string;
  txHash?: string;
}

export class FomoWebSocket extends EventEmitter {
  private ws: WebSocket | null = null;
  private isConnecting = false;
  private shouldReconnect = true;
  private reconnectAttempts = 0;
  private pingInterval: NodeJS.Timeout | null = null;
  private readonly maxReconnectAttempts = 15;
  private readonly baseBackoffMs = 2000;

  constructor() {
    super();
  }

  public connect(): void {
    if (this.ws || this.isConnecting) return;
    this.isConnecting = true;

    // Build URL with query params
    const url = new URL(config.FOMO_WS_URL);
    if (config.FOMO_CHAIN) {
      url.searchParams.set("chain", config.FOMO_CHAIN);
    }
    if (config.FOMO_API_KEY) {
      url.searchParams.set("key", config.FOMO_API_KEY);
    }

    logger.info(
      { url: url.origin + url.pathname, chain: config.FOMO_CHAIN },
      "Connecting to FOMO WebSocket...",
    );

    try {
      this.ws = new WebSocket(url.toString());

      this.ws.on("open", () => {
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        logger.info(" Connected to FOMO stream");
        this.emit("connected");
        this.startHeartbeat();
      });

      this.ws.on("message", (data: WebSocket.RawData) => {
        try {
          const payload = JSON.parse(data.toString());
          this.handleMessage(payload);
        } catch (err: any) {
          logger.error(
            { err: err.message },
            "Failed to parse incoming WebSocket message",
          );
        }
      });

      this.ws.on("close", (code: number, reason: Buffer) => {
        this.cleanup();
        logger.warn(
          { code, reason: reason.toString() },
          "FOMO WebSocket disconnected",
        );
        this.emit("disconnected", code);
        this.scheduleReconnect();
      });

      this.ws.on("error", (err: Error) => {
        logger.error({ err: err.message }, "FOMO WebSocket error");
        this.emit("error", err);
      });
    } catch (err: any) {
      this.isConnecting = false;
      logger.error(
        { err: err.message },
        "Immediate failure connecting to WebSocket",
      );
      this.scheduleReconnect();
    }
  }

  private handleMessage(payload: any): void {
    if (payload.type === "welcome") {
      logger.info(
        { realtime: payload.realtime, delaySeconds: payload.delaySeconds },
        "Stream welcome packet received",
      );
      return;
    }

    const alert = payload as BaseAlert;

    switch (alert.type) {
      case "buy":
        this.emit("buy", alert);
        break;
      case "sell":
        this.emit("sell", alert);
        break;
      case "thesis":
        this.emit("thesis", alert);
        break;
      case "perp":
        this.emit("perp", alert);
        break;
      default:
        this.emit("alert", alert);
        break;
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.ping();
      }
    }, 30000);
  }

  private stopHeartbeat(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private cleanup(): void {
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws = null;
    }
    this.isConnecting = false;
  }

  private scheduleReconnect(): void {
    if (!this.shouldReconnect) return;

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error("Max WebSocket reconnect attempts reached. Giving up.");
      return;
    }

    const backoff = Math.min(
      this.baseBackoffMs * Math.pow(1.5, this.reconnectAttempts),
      30000,
    );
    this.reconnectAttempts++;

    logger.info(
      { attempt: this.reconnectAttempts, delayMs: backoff },
      "Scheduling reconnect...",
    );
    setTimeout(() => {
      this.connect();
    }, backoff);
  }

  public disconnect(): void {
    this.shouldReconnect = false;
    this.cleanup();
    if (this.ws) {
      this.ws.close();
    }
    logger.info("WebSocket disconnected manually");
  }
}

export const fomoWS = new FomoWebSocket();
