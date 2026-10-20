import { VersionedTransaction } from "@solana/web3.js";
import { config } from "../config/index.js";
import { logger } from "../utils/logger.js";
import { solana } from "./solana.js";

export const SOL_MINT = "So11111111111111111111111111111111111111112";

export interface JupiterQuoteResponse {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  priceImpactPct: string;
  routePlan: any[];
  error?: string;
}

export interface SwapResult {
  success: boolean;
  txid?: string;
  inAmount: number;
  outAmount: number;
  error?: string;
  simulated?: boolean;
}

export class JupiterClient {
  private quoteBaseUrl = "https://quote-api.jup.ag/v6";

  /**
   * Fetches the best swap route from Jupiter
   */
  async getQuote(
    inputMint: string,
    outputMint: string,
    amountLamports: number | string,
    slippageBps: number = config.COPY_TRADE_SLIPPAGE_BPS,
  ): Promise<JupiterQuoteResponse | null> {
    try {
      const url = `${this.quoteBaseUrl}/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amountLamports}&slippageBps=${slippageBps}`;
      const res = await fetch(url);
      const data = (await res.json()) as JupiterQuoteResponse;

      if (data.error) {
        logger.warn(
          { error: data.error, inputMint, outputMint },
          "Jupiter quote returned error",
        );
        return null;
      }
      return data;
    } catch (err: any) {
      logger.error({ err: err.message }, "Failed to fetch Jupiter quote");
      return null;
    }
  }

  /**
   * Executes a swap using the provided quote
   */
  async executeSwap(quote: JupiterQuoteResponse): Promise<SwapResult> {
    if (!solana.wallet) {
      return {
        success: false,
        error: "No wallet initialized",
        inAmount: 0,
        outAmount: 0,
      };
    }

    const inAmountNum = Number(quote.inAmount);
    const outAmountNum = Number(quote.outAmount);

    // If running in SIMULATION mode, log and return mock success
    if (solana.isSimulation) {
      const mockTxid = `sim_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      logger.info(
        {
          simulated: true,
          txid: mockTxid,
          inputMint: quote.inputMint,
          outputMint: quote.outputMint,
          inAmount: inAmountNum,
          outAmount: outAmountNum,
          priceImpact: quote.priceImpactPct,
        },
        " [SIMULATION] Swap executed virtually",
      );

      return {
        success: true,
        txid: mockTxid,
        inAmount: inAmountNum,
        outAmount: outAmountNum,
        simulated: true,
      };
    }

    // LIVE MODE EXECUTION
    try {
      logger.info(
        {
          inputMint: quote.inputMint,
          outputMint: quote.outputMint,
          inAmount: inAmountNum,
        },
        "Requesting serialized swap transaction from Jupiter...",
      );

      const swapRes = await fetch(`${this.quoteBaseUrl}/swap`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quoteResponse: quote,
          userPublicKey: solana.wallet.publicKey.toBase58(),
          wrapAndUnwrapSol: true,
          dynamicComputeUnitLimit: true,
          prioritizationFeeLamports: "auto",
        }),
      });

      const swapData = (await swapRes.json()) as {
        swapTransaction?: string;
        error?: string;
      };

      if (!swapData.swapTransaction) {
        throw new Error(
          swapData.error || "No swapTransaction returned by Jupiter",
        );
      }

      // Deserialize the VersionedTransaction
      const swapTxBuf = Buffer.from(swapData.swapTransaction, "base64");
      const transaction = VersionedTransaction.deserialize(swapTxBuf);

      // Sign locally with bot's wallet
      transaction.sign([solana.wallet]);

      // Broadcast to Solana
      const rawTx = transaction.serialize();
      const txid = await solana.connection.sendRawTransaction(rawTx, {
        skipPreflight: true,
        maxRetries: 3,
      });

      logger.info(
        { txid: `https://solscan.io/tx/${txid}` },
        "🚀 Swap broadcasted to Solana",
      );

      // Wait for confirmation
      const latestBlockhash = await solana.connection.getLatestBlockhash();
      const confirmation = await solana.connection.confirmTransaction({
        signature: txid,
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
      });

      if (confirmation.value.err) {
        throw new Error(
          `Transaction failed on-chain: ${JSON.stringify(confirmation.value.err)}`,
        );
      }

      logger.info({ txid }, "🎉 Swap confirmed successfully!");

      return {
        success: true,
        txid,
        inAmount: inAmountNum,
        outAmount: outAmountNum,
        simulated: false,
      };
    } catch (err: any) {
      logger.error({ err: err.message }, "Failed to execute Jupiter swap");
      return {
        success: false,
        error: err.message,
        inAmount: inAmountNum,
        outAmount: outAmountNum,
      };
    }
  }
}

export const jupiter = new JupiterClient();
