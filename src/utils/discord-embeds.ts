import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from "discord.js";
import { BaseAlert } from "../core/fomo-ws.js";
import {
  TokenDevsResponse,
  TokenStatsResponse,
  TokenWarningsResponse,
} from "../core/fomo-client.js";

export function createWhaleAlertEmbed(alert: BaseAlert) {
  const isBuy = alert.type === "buy";
  const color = isBuy ? 0x00ff88 : 0xff3366; // Bright green or neon red
  const sideEmoji = isBuy ? "🟢" : "🔴";
  const title = `${sideEmoji} WHALE ${alert.type.toUpperCase()}: $${(alert.tradeUsd || 0).toLocaleString()} of $${alert.token || "TOKEN"}`;

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setColor(color)
    .setTimestamp(alert.ts ? new Date(alert.ts) : new Date())
    .addFields(
      {
        name: "👤 Trader",
        value: alert.trader
          ? `[@${alert.trader}](https://fomo.family/profile/${alert.trader})`
          : "Unknown",
        inline: true,
      },
      {
        name: "💰 Size (USD)",
        value: `$${(alert.tradeUsd || 0).toLocaleString()}`,
        inline: true,
      },
      {
        name: "🌐 Chain",
        value: alert.chain?.toUpperCase() || "SOLANA",
        inline: true,
      },
    );

  if (alert.positionValueUsd && isBuy) {
    embed.addFields({
      name: "📊 Total Position Value",
      value: `$${alert.positionValueUsd.toLocaleString()}`,
      inline: true,
    });
  }

  if (alert.realizedPnlUsd && !isBuy) {
    const isPnlPositive = alert.realizedPnlUsd >= 0;
    embed.addFields({
      name: "📈 Position Realized PnL",
      value: `${isPnlPositive ? "+" : ""}$${alert.realizedPnlUsd.toLocaleString()}`,
      inline: true,
    });
  }

  if (alert.tokenAddress) {
    embed.addFields({
      name: "🪙 Mint Address",
      value: `\`${alert.tokenAddress}\``,
      inline: false,
    });
  }

  if (alert.tokenImageUrl) {
    embed.setThumbnail(alert.tokenImageUrl);
  }

  // Action Buttons
  const buttons = new ActionRowBuilder<ButtonBuilder>();
  if (alert.tokenAddress) {
    buttons.addComponents(
      new ButtonBuilder()
        .setLabel("Photon")
        .setStyle(ButtonStyle.Link)
        .setURL(`https://photon-sol.tinyastro.io/en/lp/${alert.tokenAddress}`),
      new ButtonBuilder()
        .setLabel("DexScreener")
        .setStyle(ButtonStyle.Link)
        .setURL(`https://dexscreener.com/solana/${alert.tokenAddress}`),
      new ButtonBuilder()
        .setLabel("Jupiter Swap")
        .setStyle(ButtonStyle.Link)
        .setURL(`https://jup.ag/swap/SOL-${alert.tokenAddress}`),
    );
  }

  return { embed, components: buttons.components.length > 0 ? [buttons] : [] };
}

export function createRugCheckEmbed(
  address: string,
  warnings: TokenWarningsResponse,
  stats?: TokenStatsResponse,
  devs?: TokenDevsResponse,
) {
  const isHoneypot =
    warnings.buyDisabled ||
    warnings.sellDisabled ||
    warnings.tradingDisabled ||
    warnings.warnings?.some(
      (w) => w.severity === "SEVERE" && w.type === "HIGH_TRANSFER_FEE",
    );

  const severeWarnings =
    warnings.warnings?.filter((w) => w.severity === "SEVERE") || [];
  const moderateWarnings =
    warnings.warnings?.filter((w) => w.severity === "MODERATE") || [];

  let statusEmoji = "🟢";
  let statusText = "SAFE (Low Risk)";
  let color = 0x00ff88;

  if (isHoneypot || severeWarnings.length > 0) {
    statusEmoji = "🔴";
    statusText = "DANGER (Severe Risk / Honeypot)";
    color = 0xff0044;
  } else if (moderateWarnings.length > 0) {
    statusEmoji = "🟡";
    statusText = "CAUTION (Moderate Risk)";
    color = 0xffbb00;
  }

  const embed = new EmbedBuilder()
    .setTitle(`${statusEmoji} Rug-Check Report: ${statusText}`)
    .setColor(color)
    .setDescription(`Token: \`${address}\``)
    .setTimestamp(new Date());

  // Trading status
  embed.addFields({
    name: "🔒 Trading Status",
    value: `Buy Allowed: ${warnings.buyDisabled ? "❌ No" : "✅ Yes"}\nSell Allowed: ${warnings.sellDisabled ? "❌ No" : "✅ Yes"}\nAllowlisted: ${warnings.allowlisted ? "✅ Yes" : "⚠️ No"}`,
    inline: true,
  });

  // Dev stats
  if (devs) {
    embed.addFields({
      name: "👨‍💻 Dev Activity",
      value: `Dev Holdings: ${devs.devHoldingsPercent ? `${devs.devHoldingsPercent}%` : "Unknown"}\nHas Dev Sold: ${devs.hasDevSold ? "⚠️ Yes" : "✅ No"}`,
      inline: true,
    });
  }

  // Volume & flow
  if (stats) {
    const m5Buys = stats.buyCount?.m5 || 0;
    const m5Sells = stats.sellCount?.m5 || 0;
    embed.addFields({
      name: "📊 5-Min Flow",
      value: `Buys: ${m5Buys} | Sells: ${m5Sells}\nTop 10 Concentration: ${stats.topHoldersConcentrationPercent ? `${stats.topHoldersConcentrationPercent}%` : "N/A"}`,
      inline: true,
    });
  }

  // Warnings list
  if (warnings.warnings && warnings.warnings.length > 0) {
    const list = warnings.warnings
      .map((w) => `• [${w.severity}] **${w.name}**: ${w.description}`)
      .join("\n");
    embed.addFields({
      name: "⚠️ Active Warnings",
      value: list.length > 1024 ? list.substring(0, 1020) + "..." : list,
      inline: false,
    });
  } else {
    embed.addFields({
      name: "✅ Warnings",
      value: "No warnings flagged by FOMO engine.",
      inline: false,
    });
  }

  const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setLabel("DexScreener")
      .setStyle(ButtonStyle.Link)
      .setURL(`https://dexscreener.com/solana/${address}`),
    new ButtonBuilder()
      .setLabel("RugCheck.xyz")
      .setStyle(ButtonStyle.Link)
      .setURL(`https://rugcheck.xyz/tokens/${address}`),
  );

  return { embed, components: [buttons] };
}

export function createThesisEmbed(alert: BaseAlert, aiAnalysis?: any) {
  const embed = new EmbedBuilder()
    .setTitle(
      `🧠 New Thesis by @${alert.trader || "anonymous"} on $${alert.token || "TOKEN"}`,
    )
    .setColor(0x9945ff) // Solana purple
    .setTimestamp(alert.ts ? new Date(alert.ts) : new Date())
    .setDescription(alert.thesisText || "No text provided");

  if (alert.tokenAddress) {
    embed.addFields({
      name: "🪙 Token Address",
      value: `\`${alert.tokenAddress}\``,
      inline: true,
    });
  }

  if (aiAnalysis) {
    embed.addFields(
      {
        name: "🤖 AI Sentiment",
        value: `${aiAnalysis.sentimentScore}/100 (${aiAnalysis.conviction} conviction)`,
        inline: true,
      },
      {
        name: "🏷️ Catalysts",
        value: aiAnalysis.catalysts?.join(", ") || "None identified",
        inline: false,
      },
    );
  }

  return { embed };
}
