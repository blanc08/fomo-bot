import { LRUCache } from "lru-cache";
import { logger } from "../utils/logger.js";

export class CacheManager {
  // Token warnings cache (TTL: 10 minutes, max 500 tokens)
  private warningsCache = new LRUCache<string, any>({
    max: 500,
    ttl: 10 * 60 * 1000,
  });

  // Trader profile cache (TTL: 1 hour, max 500 traders)
  private traderCache = new LRUCache<string, any>({
    max: 500,
    ttl: 60 * 60 * 1000,
  });

  // Token stats cache (TTL: 5 minutes, max 500 tokens)
  private tokenStatsCache = new LRUCache<string, any>({
    max: 500,
    ttl: 5 * 60 * 1000,
  });

  // Processed event IDs (TTL: 15 minutes, prevent duplicate Discord embeds)
  private processedEvents = new LRUCache<string, boolean>({
    max: 5000,
    ttl: 15 * 60 * 1000,
  });

  getTokenWarnings(address: string) {
    return this.warningsCache.get(address.toLowerCase());
  }

  setTokenWarnings(address: string, data: any) {
    this.warningsCache.set(address.toLowerCase(), data);
  }

  getTraderProfile(handle: string) {
    return this.traderCache.get(handle.toLowerCase());
  }

  setTraderProfile(handle: string, data: any) {
    this.traderCache.set(handle.toLowerCase(), data);
  }

  getTokenStats(address: string) {
    return this.tokenStatsCache.get(address.toLowerCase());
  }

  setTokenStats(address: string, data: any) {
    this.tokenStatsCache.set(address.toLowerCase(), data);
  }

  isEventProcessed(eventId: string): boolean {
    return Boolean(this.processedEvents.get(eventId));
  }

  markEventProcessed(eventId: string) {
    this.processedEvents.set(eventId, true);
  }

  clear() {
    this.warningsCache.clear();
    this.traderCache.clear();
    this.tokenStatsCache.clear();
    this.processedEvents.clear();
    logger.info("Cache cleared");
  }
}

export const cache = new CacheManager();
