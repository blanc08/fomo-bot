# FOMO & Solana Trading Bot Suite

A modular, production-ready bot suite built in **TypeScript** integrating **fomo.family** trader intelligence with the **Jupiter Swap API** (`@jup-ag/api`) on Solana.

---

## Unified Two-Engine Architecture

Instead of running separate disconnected bots, the system is organized into **two focused engines**:

```
fomo-bot/
├── 1. UNIFIED DISCORD BOT (Community & Intelligence Hub)
│   ├── Auto-Streaming Feeds:
│   │   ├── 🐋 Whale Alert Channel (#whale-alerts) - Large buys/sells (> $3,000 USD)
│   │   └── 🧠 AI Thesis & Alpha Channel (#alpha-theses) - Trader theses & narrative spikes
│   └── Interactive Slash Commands:
│       ├── /check <mint>         → Instant token rug-check, honeypot test & dev audit
│       ├── /leaderboard [window] → Top 10 traders by PnL (24h, 7d, 30d, all-time)
│       └── /trader <handle>      → Inspect any trader's win rate, 30d PnL & wallet
│
└── 2. JUPITER ON-CHAIN COPY-TRADER (Automated Execution Engine)
    ├── Auto-loads top 5 traders from FOMO 30-day leaderboard
    ├── Automated pre-flight rug-check before any buy (aborts if honeypot/tax flagged)
    ├── Dynamic slippage & priority fees via Jupiter v6
    └── Safe SIMULATION (paper trading) or LIVE execution mode
```

---

## Directory Structure

```
src/
├── config/
│   └── index.ts          # Zod-validated environment config
├── core/
│   ├── fomo-client.ts    # REST API client with credit cost tracking
│   ├── fomo-ws.ts        # Resilient WebSocket with 30s heartbeat & auto-reconnect
│   ├── cache.ts          # In-memory LRU cache (prevents burning API credits)
│   ├── solana.ts         # Solana RPC connection & wallet manager
│   ├── jupiter.ts        # Jupiter v6 quote & swap execution engine
│   └── rug-checker.ts    # Token safety scoring engine (honeypot, dev dump, flow)
├── discord/
│   └── index.ts          # Unified Discord Bot (Feeds + Slash Commands)
├── trader/
│   └── index.ts          # Jupiter Copy-Trading Engine
├── utils/
│   ├── logger.ts         # Pino structured logger
│   └── discord-embeds.ts # Rich Discord embed formatters & action buttons
└── index.ts              # Application orchestrator
```

---

## Quickstart

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment (`.env`)

```bash
cp .env.example .env
```

Configure your credentials in `.env`:

```ini
# FOMO API Key (from https://fomoapi.io/dashboard)
FOMO_API_KEY=your_key_here
FOMO_CHAIN=solana

# Discord Bot Credentials (optional - runs in console mock mode if omitted)
DISCORD_BOT_TOKEN=your_bot_token
DISCORD_CLIENT_ID=your_client_id
DISCORD_WHALE_CHANNEL_ID=your_whale_channel_id
DISCORD_ALPHA_CHANNEL_ID=your_alpha_theses_channel_id
MIN_WHALE_TRADE_USD=3000

# Solana & Jupiter Copy-Trader
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
SOLANA_PRIVATE_KEY=your_base58_private_key
BOT_MODE=simulation # Keep "simulation" to paper trade without risking real SOL
COPY_TRADE_AMOUNT_SOL=0.1
COPY_TRADE_SLIPPAGE_BPS=250 # 2.5%
COPY_TRADE_TARGET_HANDLES= # Leave empty to auto-mirror top 5 traders on FOMO leaderboard
```

### 3. Run the Suite

- **Development (Live Reload):**
  ```bash
  npm run dev
  ```
- **Production Build & Run:**
  ```bash
  npm run build
  npm run start:prod
  ```
- **Typecheck:**
  ```bash
  npm run typecheck
  ```

---

## Docker & Docker Compose Deployment

The bot includes an optimized multi-stage `Dockerfile` (Alpine Linux) and `docker-compose.yml` for 24/7 server and VPS deployment.

### 1. Configure `.env`
Ensure your `.env` file is set up with your API keys and configuration:
```bash
cp .env.example .env
# Edit .env with your credentials
```

### 2. Start with Docker Compose
Run the container detached in the background with auto-restart:
```bash
docker compose up -d --build
```

### 3. Useful Commands
- **View live streaming logs:**
  ```bash
  docker compose logs -f
  ```
- **Check container status:**
  ```bash
  docker compose ps
  ```
- **Restart the bot:**
  ```bash
  docker compose restart
  ```
- **Stop and remove container:**
  ```bash
  docker compose down
  ```

