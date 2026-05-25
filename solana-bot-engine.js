// solana-bot-engine.js - Solana Meme Coin Trading Bot
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL
} = require('@solana/web3.js');
const {
  createJupiterApiClient,
  QuoteGetRequest,
  SwapMode,
} = require('@jup-ag/api');
const { TwitterApi } = require('twitter-api-v2');
const axios = require('axios');

// ==================== DATABASE MODELS ====================
const TradeSchema = new mongoose.Schema({
  token: String,
  mint: String,
  entryPrice: Number,
  exitPrice: Number,
  quantity: Number,
  pnl: Number,
  pnlPercentage: Number,
  duration: Number,
  reason: String,
  txHash: String,
  timestamp: { type: Date, default: Date.now }
});

const PositionSchema = new mongoose.Schema({
  token: String,
  mint: String,
  entryPrice: Number,
  currentPrice: Number,
  quantity: Number,
  takeProfitPrice: Number,
  stopLossPrice: Number,
  status: { type: String, enum: ['OPEN', 'CLOSED'] },
  pnl: Number,
  pnlPercentage: Number,
  openedAt: { type: Date, default: Date.now },
  closedAt: Date,
  closeReason: String,
  txHash: String
});

const Trade = mongoose.model('Trade', TradeSchema);
const Position = mongoose.model('Position', PositionSchema);

// ==================== SOLANA BOT CONFIGURATION ====================
const config = {
  trading: {
    tpMultiplier: parseFloat(process.env.TP_MULTIPLIER) || 5,
    slPercentage: parseFloat(process.env.SL_PERCENTAGE) || 20,
    maxPosition: parseFloat(process.env.MAX_POSITION) || 100, // SOL
  },
  scanner: {
    twitterScanInterval: 5000,
    magicEdenInterval: 10000,
    minHypeScore: 65,
    minLiquidity: 50000, // $50k
  },
  risk: {
    maxDrawdown: 25,
    dailyLossLimit: -500,
    maxOpenPositions: 10,
    slippage: 0.5 // 0.5%
  },
  solana: {
    rpc: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
    network: process.env.SOLANA_NETWORK || 'mainnet-beta',
    programId: new PublicKey('11111111111111111111111111111111') // SPL Token Program
  }
};

// ==================== SOLANA WEB3 SETUP ====================
class SolanaConnection {
  constructor() {
    this.connection = new Connection(config.solana.rpc, 'confirmed');
    this.wallet = Keypair.fromSecretKey(
      new Uint8Array(JSON.parse(process.env.SOLANA_PRIVATE_KEY || '[]'))
    );
    this.jupiterClient = createJupiterApiClient();
  }

  async getWalletBalance() {
    try {
      const balance = await this.connection.getBalance(this.wallet.publicKey);
      return balance / LAMPORTS_PER_SOL;
    } catch (error) {
      console.error('Error getting balance:', error);
      return 0;
    }
  }

  async getTokenBalance(tokenMint) {
    try {
      const splTokenAccounts = await this.connection.getParsedTokenAccountsByOwner(
        this.wallet.publicKey,
        { mint: new PublicKey(tokenMint) }
      );

      if (splTokenAccounts.value.length === 0) return 0;
      
      const balance = splTokenAccounts.value[0].account.data.parsed.info.tokenAmount.uiAmount;
      return balance;
    } catch (error) {
      console.error('Error getting token balance:', error);
      return 0;
    }
  }

  async getTokenPrice(tokenMint) {
    try {
      const response = await axios.get(
        `https://api.coingecko.com/api/v3/simple/token_price/solana?contract_addresses=${tokenMint}&vs_currencies=usd`
      );
      return response.data[tokenMint.toLowerCase()]?.usd || 0;
    } catch (error) {
      console.error('Error getting token price:', error);
      return 0;
    }
  }

  async swapTokens(inputMint, outputMint, amountLamports) {
    try {
      console.log(`🔄 Swapping ${amountLamports / LAMPORTS_PER_SOL} SOL...`);

      // Get quote from Jupiter
      const quote = await this.jupiterClient.quoteGet({
        inputMint: inputMint === 'SOL' ? 'So11111111111111111111111111111111111111112' : inputMint,
        outputMint: outputMint === 'SOL' ? 'So11111111111111111111111111111111111111112' : outputMint,
        amount: amountLamports,
        slippageBps: config.risk.slippage * 100, // Convert to basis points
        swapMode: SwapMode.ExactIn,
      });

      // Get swap instructions
      const swapTransaction = await this.jupiterClient.swapPost({
        swapRequest: {
          quoteResponse: quote,
          userPublicKey: this.wallet.publicKey.toString(),
          dynamicSlippage: { minBps: Math.floor(config.risk.slippage * 100) },
          dynamicCompressionLevel: 'high'
        }
      });

      // Send transaction
      const txBuffer = Buffer.from(swapTransaction.swapTransaction, 'base64');
      const transaction = Transaction.from(txBuffer);
      transaction.sign(this.wallet);

      const txHash = await this.connection.sendRawTransaction(transaction.serialize());
      await this.connection.confirmTransaction(txHash, 'finalized');

      console.log(`✅ Swap successful: ${txHash}`);
      return { success: true, txHash, outputAmount: quote.outAmount };
    } catch (error) {
      console.error('Swap error:', error);
      return { success: false, error: error.message };
    }
  }
}

// ==================== TWITTER SCANNER ====================
class TwitterScanner {
  constructor(apiKey, bearerToken) {
    this.client = new TwitterApi({
      bearerToken: bearerToken
    }).readOnlyClient;
    this.keywords = [
      '#solanagems', '#solmemes', '#pump', '#safemoon',
      '#newtoken', '#fairlaunch', '$SOL'
    ];
  }

  async scanTweets() {
    try {
      const query = this.keywords.map(k => `"${k}"`).join(' OR ');
      const tweets = await this.client.search.recent({
        query: `${query} -is:retweet`,
        max_results: 50,
        'tweet.fields': ['created_at', 'public_metrics'],
        expansions: ['author_id'],
        'user.fields': ['verified', 'followers_count']
      });

      return this.parseAndRankTweets(tweets);
    } catch (error) {
      console.error('Twitter scan error:', error);
      return [];
    }
  }

  parseAndRankTweets(tweetData) {
    if (!tweetData.data) return [];

    return tweetData.data.map(tweet => {
      const user = tweetData.includes?.users?.find(u => u.id === tweet.author_id);
      const hypeScore = this.calculateHype({
        likes: tweet.public_metrics.like_count,
        retweets: tweet.public_metrics.retweet_count,
        verified: user?.verified || false,
        followers: user?.followers_count || 0,
        age: Date.now() - new Date(tweet.created_at)
      });

      return {
        tokenName: this.extractTokenName(tweet.text),
        mint: this.extractMint(tweet.text),
        source: 'twitter',
        hypeScore: Math.min(hypeScore, 100),
        metrics: tweet.public_metrics,
        timestamp: new Date(tweet.created_at),
        text: tweet.text
      };
    });
  }

  calculateHype(metrics) {
    const weights = { likes: 0.3, retweets: 0.25, verified: 0.2, followers: 0.15, age: 0.1 };
    
    const likeScore = Math.min((metrics.likes / 100) * 100, 100);
    const retweetScore = Math.min((metrics.retweets / 50) * 100, 100);
    const verifiedBonus = metrics.verified ? 25 : 0;
    const followerScore = Math.min((metrics.followers / 100000) * 100, 100);
    const ageScore = Math.max(0, 100 - (metrics.age / 60000)); // Decreases with age

    return (likeScore * weights.likes) + (retweetScore * weights.retweets) +
           (verifiedBonus * weights.verified) + (followerScore * weights.followers) +
           (ageScore * weights.age);
  }

  extractTokenName(text) {
    const tokenMatch = text.match(/\$([A-Z0-9]+)/);
    return tokenMatch ? tokenMatch[1] : 'UNKNOWN';
  }

  extractMint(text) {
    const mintMatch = text.match(/([A-Za-z0-9]{43,44})/);
    return mintMatch ? mintMatch[1] : null;
  }
}

// ==================== MAGIC EDEN SCANNER ====================
class MagicEdenScanner {
  constructor() {
    this.apiUrl = 'https://api-v2.magiceden.dev/v2/tokens';
  }

  async scanNewTokens() {
    try {
      const response = await axios.get(`${this.apiUrl}?sortBy=createdAt&limit=100`);
      
      return (response.data || [])
        .filter(token => this.meetsLiquidityCriteria(token))
        .map(token => this.analyzeToken(token));
    } catch (error) {
      console.error('Magic Eden scan error:', error);
      return [];
    }
  }

  meetsLiquidityCriteria(token) {
    const liquidity = token.liquidity || 0;
    const minLiquidity = config.scanner.minLiquidity;
    return liquidity >= minLiquidity;
  }

  analyzeToken(token) {
    return {
      tokenName: token.symbol || token.name,
      mint: token.address,
      source: 'magiceden',
      liquidity: token.liquidity || 0,
      volume24h: token.volume24h || 0,
      priceChange: token.priceChange24h || 0,
      hypeScore: this.calculateTokenHype(token),
      marketCap: token.marketCap || 0,
      holders: token.holders || 0
    };
  }

  calculateTokenHype(token) {
    const liquidityScore = Math.min((token.liquidity / 1000000) * 40, 40);
    const volumeScore = Math.min((token.volume24h / 500000) * 30, 30);
    const priceChangeScore = Math.min(Math.abs(token.priceChange24h || 0) * 20, 20);
    const holderScore = Math.min((token.holders / 1000) * 10, 10);

    return liquidityScore + volumeScore + priceChangeScore + holderScore;
  }
}

// ==================== TOKEN ANALYZER ====================
class TokenAnalyzer {
  async analyzeToken(tokenData) {
    const validations = {
      liquidity: this.validateLiquidity(tokenData),
      hypeScore: this.validateHypeScore(tokenData),
      marketCap: this.validateMarketCap(tokenData)
    };

    const isPassed = Object.values(validations).every(v => v.passed);
    const confidence = this.calculateConfidence(validations);

    return {
      token: tokenData.tokenName,
      mint: tokenData.mint,
      source: tokenData.source,
      passed: isPassed,
      confidence,
      hypeScore: tokenData.hypeScore || 0,
      liquidity: tokenData.liquidity || 0,
      validations
    };
  }

  validateLiquidity(tokenData) {
    const liquidity = tokenData.liquidity || 0;
    const minLiquidity = config.scanner.minLiquidity;
    return {
      type: 'liquidity',
      passed: liquidity >= minLiquidity,
      value: liquidity,
      required: minLiquidity
    };
  }

  validateHypeScore(tokenData) {
    const hypeScore = tokenData.hypeScore || 0;
    const minHype = config.scanner.minHypeScore;
    return {
      type: 'hypeScore',
      passed: hypeScore >= minHype,
      value: hypeScore,
      required: minHype
    };
  }

  validateMarketCap(tokenData) {
    const marketCap = tokenData.marketCap || 0;
    const maxCap = 500000000; // $500M cap limit
    return {
      type: 'marketCap',
      passed: marketCap <= maxCap,
      value: marketCap,
      required: maxCap
    };
  }

  calculateConfidence(validations) {
    const passedCount = Object.values(validations).filter(v => v.passed).length;
    const totalCount = Object.values(validations).length;
    return (passedCount / totalCount) * 100;
  }
}

// ==================== RISK MANAGER ====================
class RiskManager {
  constructor() {
    this.openPositions = [];
    this.dailyLoss = 0;
  }

  validateTrade(position) {
    return {
      positionSize: this.checkPositionSize(position),
      openPositions: this.checkOpenPositions(),
      dailyLoss: this.checkDailyLossLimit(),
      passed: this.checkOpenPositions().passed && this.checkDailyLossLimit().passed
    };
  }

  checkPositionSize(position) {
    return {
      passed: position <= config.trading.maxPosition,
      actual: position,
      limit: config.trading.maxPosition
    };
  }

  checkOpenPositions() {
    return {
      passed: this.openPositions.length < config.risk.maxOpenPositions,
      actual: this.openPositions.length,
      limit: config.risk.maxOpenPositions
    };
  }

  checkDailyLossLimit() {
    return {
      passed: this.dailyLoss >= config.risk.dailyLossLimit,
      actual: this.dailyLoss,
      limit: config.risk.dailyLossLimit
    };
  }

  addPosition(position) {
    this.openPositions.push(position);
  }

  removePosition(mint) {
    this.openPositions = this.openPositions.filter(p => p.mint !== mint);
  }

  updateDailyLoss(pnl) {
    this.dailyLoss += pnl;
  }
}

// ==================== SOLANA BOT ENGINE ====================
class SolanaBotEngine {
  constructor() {
    this.solana = new SolanaConnection();
    this.twitterScanner = new TwitterScanner(
      process.env.TWITTER_API_KEY,
      process.env.TWITTER_BEARER_TOKEN
    );
    this.mEdenScanner = new MagicEdenScanner();
    this.analyzer = new TokenAnalyzer();
    this.riskManager = new RiskManager();
    this.isRunning = false;
    this.scannedTokens = new Set();
  }

  async start() {
    this.isRunning = true;
    console.log('🚀 SolanaBot Pro started!');

    this.startTwitterScanning();
    this.startMagicEdenScanning();
    this.startPositionMonitoring();
  }

  stop() {
    this.isRunning = false;
    console.log('🛑 SolanaBot Pro stopped');
  }

  startTwitterScanning() {
    setInterval(async () => {
      if (!this.isRunning) return;

      try {
        const tweets = await this.twitterScanner.scanTweets();
        for (const tweet of tweets) {
          if (tweet.hypeScore >= config.scanner.minHypeScore) {
            await this.processPotentialToken(tweet);
          }
        }
      } catch (error) {
        console.error('Twitter scanning error:', error);
      }
    }, config.scanner.twitterScanInterval);
  }

  startMagicEdenScanning() {
    setInterval(async () => {
      if (!this.isRunning) return;

      try {
        const tokens = await this.mEdenScanner.scanNewTokens();
        for (const token of tokens) {
          if (token.hypeScore >= config.scanner.minHypeScore) {
            await this.processPotentialToken(token);
          }
        }
      } catch (error) {
        console.error('Magic Eden scanning error:', error);
      }
    }, config.scanner.magicEdenInterval);
  }

  async processPotentialToken(tokenData) {
    const tokenKey = `${tokenData.tokenName}-${tokenData.source}`;
    if (this.scannedTokens.has(tokenKey)) return;
    this.scannedTokens.add(tokenKey);

    const analysis = await this.analyzer.analyzeToken(tokenData);

    if (analysis.passed) {
      console.log(`✅ ${tokenData.tokenName} passed analysis (${analysis.confidence.toFixed(1)}% confidence)`);
      
      const riskCheck = this.riskManager.validateTrade(config.trading.maxPosition);
      if (riskCheck.passed) {
        await this.buyToken(analysis);
      } else {
        console.log(`⚠️ ${tokenData.tokenName} failed risk check`);
      }
    }

    setTimeout(() => this.scannedTokens.delete(tokenKey), 60 * 60 * 1000);
  }

  async buyToken(analysis) {
    try {
      console.log(`🚀 Buying ${analysis.token}...`);

      const solAmountLamports = config.trading.maxPosition * LAMPORTS_PER_SOL;
      const swapResult = await this.solana.swapTokens(
        'So11111111111111111111111111111111111111112', // WSOL
        analysis.mint,
        solAmountLamports
      );

      if (!swapResult.success) {
        console.error('Swap failed:', swapResult.error);
        return;
      }

      const entryPrice = config.trading.maxPosition / (swapResult.outputAmount / 10 ** 9);
      const position = {
        token: analysis.token,
        mint: analysis.mint,
        entryPrice,
        currentPrice: entryPrice,
        quantity: swapResult.outputAmount / 10 ** 9,
        takeProfitPrice: entryPrice * config.trading.tpMultiplier,
        stopLossPrice: entryPrice * (1 - (config.trading.slPercentage / 100)),
        status: 'OPEN',
        pnl: 0,
        pnlPercentage: 0,
        openedAt: new Date(),
        txHash: swapResult.txHash
      };

      const newPosition = await Position.create(position);
      this.riskManager.addPosition(newPosition);

      console.log(`✅ Position opened for ${analysis.token}`);
      return newPosition;

    } catch (error) {
      console.error(`Error buying ${analysis.token}:`, error);
    }
  }

  startPositionMonitoring() {
    setInterval(async () => {
      if (!this.isRunning) return;

      try {
        const openPositions = await Position.find({ status: 'OPEN' });

        for (const position of openPositions) {
          const currentPrice = await this.solana.getTokenPrice(position.mint);
          
          position.currentPrice = currentPrice;
          position.pnl = (currentPrice - position.entryPrice) * position.quantity;
          position.pnlPercentage = ((currentPrice - position.entryPrice) / position.entryPrice) * 100;

          if (currentPrice >= position.takeProfitPrice) {
            await this.closePosition(position, 'TAKE_PROFIT');
          } else if (currentPrice <= position.stopLossPrice) {
            await this.closePosition(position, 'STOP_LOSS');
          } else {
            await position.save();
          }
        }
      } catch (error) {
        console.error('Position monitoring error:', error);
      }
    }, 5000);
  }

  async closePosition(position, reason) {
    try {
      console.log(`🔴 Closing ${position.token} - ${reason}`);

      const swapResult = await this.solana.swapTokens(
        position.mint,
        'So11111111111111111111111111111111111111112',
        position.quantity * 10 ** 9
      );

      position.status = 'CLOSED';
      position.closedAt = new Date();
      position.closeReason = reason;

      await position.save();

      const trade = new Trade({
        token: position.token,
        mint: position.mint,
        entryPrice: position.entryPrice,
        exitPrice: position.currentPrice,
        quantity: position.quantity,
        pnl: position.pnl,
        pnlPercentage: position.pnlPercentage,
        reason,
        txHash: swapResult.txHash
      });

      await trade.save();
      this.riskManager.removePosition(position.mint);
      this.riskManager.updateDailyLoss(position.pnl);

      console.log(`✅ Trade closed: ${position.token} - P&L: $${position.pnl.toFixed(2)}`);

    } catch (error) {
      console.error('Error closing position:', error);
    }
  }
}

// ==================== EXPRESS SERVER ====================
const app = express();
app.use(express.json());

let bot = null;

async function initializeDatabase() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/solanabot');
    console.log('✅ Database connected');
  } catch (error) {
    console.error('Database connection error:', error);
  }
}

// REST API Endpoints
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok',
    bot: bot?.isRunning ? 'running' : 'stopped'
  });
});

app.post('/api/bot/start', (req, res) => {
  if (!bot) bot = new SolanaBotEngine();
  bot.start();
  res.json({ status: 'Bot started' });
});

app.post('/api/bot/stop', (req, res) => {
  if (bot) bot.stop();
  res.json({ status: 'Bot stopped' });
});

app.get('/api/positions', async (req, res) => {
  const positions = await Position.find();
  res.json(positions);
});

app.get('/api/trades', async (req, res) => {
  const trades = await Trade.find().sort({ timestamp: -1 }).limit(50);
  res.json(trades);
});

app.get('/api/stats', async (req, res) => {
  const trades = await Trade.find();
  const winningTrades = trades.filter(t => t.pnl > 0).length;
  const winRate = trades.length > 0 ? (winningTrades / trades.length) * 100 : 0;
  const totalPnL = trades.reduce((sum, t) => sum + t.pnl, 0);

  res.json({
    totalTrades: trades.length,
    winRate: winRate.toFixed(2),
    totalPnL: totalPnL.toFixed(2),
    winningTrades,
    losingTrades: trades.length - winningTrades
  });
});

const PORT = process.env.PORT || 3001;

async function start() {
  await initializeDatabase();
  app.listen(PORT, () => {
    console.log(`\n🌟 SolanaBot Pro Server running on http://localhost:${PORT}`);
    console.log(`📊 Dashboard: http://localhost:${PORT}\n`);
  });
}

start().catch(console.error);

module.exports = { SolanaBotEngine };
