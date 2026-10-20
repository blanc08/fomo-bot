import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
} from "@solana/web3.js";
import bs58 from "bs58";
import { config } from "../config/index.js";
import { logger } from "../utils/logger.js";

export class SolanaManager {
  public connection: Connection;
  public wallet: Keypair | null = null;
  public isSimulation: boolean;

  constructor() {
    this.connection = new Connection(config.SOLANA_RPC_URL, "confirmed");
    this.isSimulation = config.BOT_MODE === "simulation";

    if (config.SOLANA_PRIVATE_KEY) {
      try {
        const secret = bs58.decode(config.SOLANA_PRIVATE_KEY.trim());
        this.wallet = Keypair.fromSecretKey(secret);
        logger.info(
          {
            publicKey: this.wallet.publicKey.toBase58(),
            mode: config.BOT_MODE,
          },
          "Solana wallet initialized",
        );
      } catch (err: any) {
        logger.error(
          { err: err.message },
          "Failed to parse SOLANA_PRIVATE_KEY",
        );
      }
    } else {
      if (this.isSimulation) {
        this.wallet = Keypair.generate();
        logger.info(
          { pubkey: this.wallet.publicKey.toBase58() },
          "Running in SIMULATION mode with dummy wallet",
        );
      } else {
        logger.warn(
          "No SOLANA_PRIVATE_KEY provided and mode is LIVE. Trading will be disabled.",
        );
      }
    }
  }

  async getSolBalance(): Promise<number> {
    if (!this.wallet) return 0;
    try {
      const lamports = await this.connection.getBalance(this.wallet.publicKey);
      return lamports / LAMPORTS_PER_SOL;
    } catch (err: any) {
      logger.error({ err: err.message }, "Failed to fetch SOL balance");
      return 0;
    }
  }

  async getTokenBalance(mintAddress: string): Promise<number> {
    if (!this.wallet) return 0;
    try {
      const mint = new PublicKey(mintAddress);
      const tokenAccounts = await this.connection.getParsedTokenAccountsByOwner(
        this.wallet.publicKey,
        { mint },
      );
      if (tokenAccounts.value.length === 0) return 0;
      const balance =
        tokenAccounts.value[0].account.data.parsed.info.tokenAmount.uiAmount;
      return balance || 0;
    } catch (err: any) {
      logger.error(
        { mint: mintAddress, err: err.message },
        "Failed to get token balance",
      );
      return 0;
    }
  }
}

export const solana = new SolanaManager();
