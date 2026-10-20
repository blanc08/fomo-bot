import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  Client,
  EmbedBuilder,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  TextChannel,
} from "discord.js";
import { config } from "../config/index.js";
import { cache } from "../core/cache.js";
import { fomoClient } from "../core/fomo-client.js";
import { BaseAlert, fomoWS } from "../core/fomo-ws.js";
import { rugChecker } from "../core/rug-checker.js";
import {
  createRugCheckEmbed,
  createThesisEmbed,
  createWhaleAlertEmbed,
} from "../utils/discord-embeds.js";
import { logger } from "../utils/logger.js";

export class UnifiedDiscordBot {
  public client: Client;
  private isReady = false;
  private tokenThesesWindow = new Map<
    string,
    Array<{ trader: string; ts: number }>
  >();

  constructor() {
    this.client = new Client({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    this.client.on("ready", () => {
      this.isReady = true;
      logger.info(
        { user: this.client.user?.tag },
        "🤖 Unified Discord Bot online and ready",
      );
      this.registerSlashCommands();
    });

    this.client.on("interactionCreate", async (interaction) => {
      if (!interaction.isChatInputCommand()) return;

      switch (interaction.commandName) {
        case "check":
          await this.handleCheckCommand(interaction);
          break;
        case "leaderboard":
          await this.handleLeaderboardCommand(interaction);
          break;
        case "trader":
          await this.handleTraderCommand(interaction);
          break;
        default:
          break;
      }
    });

    this.client.on("error", (err) => {
      logger.error({ err: err.message }, "Discord client error");
    });
  }

  async start() {
    if (!config.DISCORD_BOT_TOKEN) {
      logger.warn(
        "DISCORD_BOT_TOKEN not provided. Discord integrations running in console-only mode.",
      );
      return;
    }

    try {
      await this.client.login(config.DISCORD_BOT_TOKEN);
      this.bindStreamListeners();
    } catch (err: any) {
      logger.error({ err: err.message }, "Failed to login to Discord");
    }
  }

  /**
   * Listen to FOMO Stream and route alerts to designated channels
   */
  private bindStreamListeners() {
    logger.info(
      "Binding Discord stream listeners for Whale Alerts and Theses...",
    );

    fomoWS.on("buy", (alert: BaseAlert) => this.processWhaleAlert(alert));
    fomoWS.on("sell", (alert: BaseAlert) => this.processWhaleAlert(alert));
    fomoWS.on("thesis", (alert: BaseAlert) => this.processThesisAlert(alert));
  }

  // =========================================================================
  // AUTOMATED CHANNEL FEEDS (Whale Alerts & Theses)
  // =========================================================================

  private async processWhaleAlert(alert: BaseAlert) {
    if (
      alert.chain &&
      alert.chain.toLowerCase() !== config.FOMO_CHAIN.toLowerCase()
    )
      return;
    const tradeUsd = alert.tradeUsd || 0;
    if (tradeUsd < config.MIN_WHALE_TRADE_USD) return;

    // Deduplication
    const eventKey =
      alert.eventId || `${alert.tradeId}_${alert.type}_${alert.ts}`;
    if (cache.isEventProcessed(eventKey)) return;
    cache.markEventProcessed(eventKey);

    logger.info(
      {
        type: alert.type,
        trader: alert.trader,
        token: alert.token,
        usd: tradeUsd,
      },
      `🚨 Whale Alert: ${alert.type.toUpperCase()} $${tradeUsd.toLocaleString()} of $${alert.token}`,
    );

    const { embed, components } = createWhaleAlertEmbed(alert);
    if (config.DISCORD_WHALE_CHANNEL_ID) {
      await this.sendToChannel(config.DISCORD_WHALE_CHANNEL_ID, {
        embeds: [embed],
        components,
      });
    }
  }

  private async processThesisAlert(alert: BaseAlert) {
    if (!alert.thesisText || !alert.tokenAddress) return;

    // Check Narrative Spike (3+ distinct traders in 1h)
    this.recordThesisInWindow(alert.tokenAddress, alert.trader || "anon");
    const isSpike = this.checkNarrativeSpike(alert.tokenAddress);

    const { embed } = createThesisEmbed(alert);
    if (isSpike) {
      embed.setTitle(`🔥 [NARRATIVE SPIKE] ${embed.data.title}`);
    }

    if (config.DISCORD_ALPHA_CHANNEL_ID) {
      await this.sendToChannel(config.DISCORD_ALPHA_CHANNEL_ID, {
        embeds: [embed],
      });
    }
  }

  // =========================================================================
  // SLASH COMMANDS: /check, /leaderboard, /trader
  // =========================================================================

  async registerSlashCommands() {
    if (!config.DISCORD_BOT_TOKEN || !config.DISCORD_CLIENT_ID) return;

    const commands = [
      new SlashCommandBuilder()
        .setName("check")
        .setDescription("Instant rug-check & due diligence on a token")
        .addStringOption((opt) =>
          opt
            .setName("mint")
            .setDescription("Token mint address")
            .setRequired(true),
        ),
      new SlashCommandBuilder()
        .setName("leaderboard")
        .setDescription("Top 10 ranked traders by PnL on FOMO")
        .addStringOption((opt) =>
          opt
            .setName("window")
            .setDescription("Time window")
            .addChoices(
              { name: "24 Hours", value: "24h" },
              { name: "7 Days", value: "7d" },
              { name: "30 Days", value: "30d" },
              { name: "All Time", value: "all" },
            )
            .setRequired(false),
        ),
      new SlashCommandBuilder()
        .setName("trader")
        .setDescription("Inspect a trader: PnL, win rate, and verified wallet")
        .addStringOption((opt) =>
          opt
            .setName("handle")
            .setDescription("Trader handle (e.g. sol_sniper)")
            .setRequired(true),
        ),
    ].map((cmd) => cmd.toJSON());

    const rest = new REST({ version: "10" }).setToken(config.DISCORD_BOT_TOKEN);
    try {
      if (config.DISCORD_GUILD_ID) {
        logger.info(
          { guildId: config.DISCORD_GUILD_ID },
          "Registering instant guild-specific slash commands...",
        );
        await rest.put(
          Routes.applicationGuildCommands(
            config.DISCORD_CLIENT_ID,
            config.DISCORD_GUILD_ID,
          ),
          { body: commands },
        );
        logger.info(
          " Instant guild slash commands registered (/check, /leaderboard, /trader)",
        );
      } else {
        logger.info("Registering global Discord slash commands...");
        await rest.put(Routes.applicationCommands(config.DISCORD_CLIENT_ID), {
          body: commands,
        });
        logger.info(
          " Global slash commands registered (/check, /leaderboard, /trader)",
        );
      }
    } catch (err: any) {
      logger.error(
        { err: err.message },
        "Failed to register Discord slash commands",
      );
    }
  }

  private async handleCheckCommand(interaction: ChatInputCommandInteraction) {
    const mint = interaction.options.getString("mint", true).trim();
    await interaction.deferReply();

    try {
      const risk = await rugChecker.assess(mint);
      const { embed, components } = createRugCheckEmbed(
        mint,
        risk.warnings,
        risk.stats,
        risk.devs,
      );
      await interaction.editReply({ embeds: [embed], components });
    } catch (err: any) {
      await interaction.editReply({
        content: `❌ Error checking token: ${err.message}`,
      });
    }
  }

  private async handleLeaderboardCommand(
    interaction: ChatInputCommandInteraction,
  ) {
    const window = (interaction.options.getString("window") || "30d") as
      | "24h"
      | "7d"
      | "30d"
      | "all";
    await interaction.deferReply();

    try {
      const response = await fomoClient.getLeaderboard(window, 10);
      const leadersList: any[] = Array.isArray(response)
        ? response
        : (response as any)?.traders || [];

      const embed = new EmbedBuilder()
        .setTitle(`🏆 FOMO Trader Leaderboard (${window.toUpperCase()})`)
        .setColor(0xffd700)
        .setTimestamp(new Date());

      if (leadersList.length === 0) {
        embed.setDescription("No leaderboard data available.");
      } else {
        const lines = leadersList.map((trader, i) => {
          const handle =
            trader.handle || trader.trader || trader.username || "anon";
          const pnl = trader.pnlUsd || trader.pnl || trader.realizedPnlUsd || 0;
          const winRate = trader.winRatePercent || trader.winRate;
          const winRateStr =
            winRate !== undefined ? ` (${winRate}% win rate)` : "";
          return `**#${i + 1}** [@${handle}](https://fomo.family/${handle}) — **+$${Math.round(pnl).toLocaleString()}**${winRateStr}`;
        });
        embed.setDescription(lines.join("\n\n"));
      }

      await interaction.editReply({ embeds: [embed] });
    } catch (err: any) {
      await interaction.editReply({
        content: `❌ Failed to fetch leaderboard: ${err.message}`,
      });
    }
  }

  private async handleTraderCommand(interaction: ChatInputCommandInteraction) {
    const handle = interaction.options.getString("handle", true).trim();
    await interaction.deferReply();

    try {
      const profile = await fomoClient.getTraderProfile(handle);
      if (!profile) {
        await interaction.editReply({
          content: `❌ Trader @${handle} not found.`,
        });
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle(`👤 Trader Profile: @${profile.handle}`)
        .setColor(0x0099ff)
        .addFields(
          {
            name: "📈 30d Realized PnL",
            value: profile.pnl?.realized30dUsd
              ? `$${profile.pnl.realized30dUsd.toLocaleString()}`
              : "N/A",
            inline: true,
          },
          {
            name: "🎯 Win Rate",
            value: profile.pnl?.winRatePercent
              ? `${profile.pnl.winRatePercent}%`
              : "N/A",
            inline: true,
          },
          {
            name: "🔢 Total Trades",
            value: profile.pnl?.totalTrades
              ? `${profile.pnl.totalTrades}`
              : "N/A",
            inline: true,
          },
          {
            name: "🔑 Verified Solana Wallet",
            value: profile.wallets?.mainSolana
              ? `\`${profile.wallets.mainSolana}\``
              : "Resolving / None",
            inline: false,
          },
        )
        .setTimestamp(new Date());

      const button = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setLabel("View on fomo.family")
          .setStyle(ButtonStyle.Link)
          .setURL(`https://fomo.family/${profile.handle}`),
      );

      await interaction.editReply({ embeds: [embed], components: [button] });
    } catch (err: any) {
      await interaction.editReply({
        content: `❌ Error resolving trader: ${err.message}`,
      });
    }
  }

  // =========================================================================
  // HELPERS
  // =========================================================================

  private recordThesisInWindow(tokenAddress: string, trader: string) {
    const now = Date.now();
    const windowMs = 60 * 60 * 1000;
    let list = this.tokenThesesWindow.get(tokenAddress) || [];
    list = list.filter((item) => now - item.ts < windowMs);
    list.push({ trader, ts: now });
    this.tokenThesesWindow.set(tokenAddress, list);
  }

  private checkNarrativeSpike(tokenAddress: string): boolean {
    const list = this.tokenThesesWindow.get(tokenAddress) || [];
    const uniqueTraders = new Set(list.map((i) => i.trader));
    return uniqueTraders.size >= 3;
  }

  async sendToChannel(
    channelId: string,
    payload: { embeds: any[]; components?: any[] },
  ) {
    if (!this.isReady || !config.DISCORD_BOT_TOKEN) {
      logger.info(
        { channelId, title: payload.embeds[0]?.data?.title },
        "[DISCORD MOCK] Message dispatched",
      );
      return;
    }

    try {
      const channel = await this.client.channels.fetch(channelId);
      if (channel && channel.isTextBased()) {
        await (channel as TextChannel).send(payload);
      }
    } catch (err: any) {
      logger.error(
        { channelId, err: err.message },
        "Failed to send message to Discord channel",
      );
    }
  }
}

export const discordBot = new UnifiedDiscordBot();
