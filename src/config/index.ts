import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const configSchema = z.object({
  // FOMO API
  FOMO_API_KEY: z.string().default(""),
  FOMO_CHAIN: z.string().default("solana"),
  FOMO_REST_BASE_URL: z.string().default("https://api.fomoapi.io"),
  FOMO_WS_URL: z.string().default("wss://api.fomoapi.io/ws/alerts"),

  // Discord
  DISCORD_BOT_TOKEN: z.string().optional().default(""),
  DISCORD_CLIENT_ID: z.string().optional().default(""),
  DISCORD_GUILD_ID: z.string().optional().default(""),
  DISCORD_WHALE_CHANNEL_ID: z.string().optional().default(""),
  DISCORD_ALPHA_CHANNEL_ID: z.string().optional().default(""),
  MIN_WHALE_TRADE_USD: z.coerce.number().default(3000),

  // Solana & Jupiter
  SOLANA_RPC_URL: z.string().default("https://api.mainnet-beta.solana.com"),
  SOLANA_PRIVATE_KEY: z.string().optional().default(""),
  BOT_MODE: z.enum(["simulation", "live"]).default("simulation"),
  COPY_TRADE_AMOUNT_SOL: z.coerce.number().default(0.1),
  COPY_TRADE_SLIPPAGE_BPS: z.coerce.number().default(250), // 2.5%
  COPY_TRADE_TARGET_HANDLES: z
    .string()
    .default("")
    .transform((val) =>
      val
        .split(",")
        .map((h) => h.trim().toLowerCase().replace(/^@/, ""))
        .filter(Boolean),
    ),

  // AI Sentiment
  GEMINI_API_KEY: z.string().optional().default(""),
  OPENAI_API_KEY: z.string().optional().default(""),

  // Logging
  LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal"])
    .default("info"),
});

export type Config = z.infer<typeof configSchema>;

export const config = configSchema.parse(process.env);
