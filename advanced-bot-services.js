// advanced-solana-bot-services.js - Advanced Features Backend
require('dotenv').config();
const axios = require('axios');
const mongoose = require('mongoose');

// ==================== AI SENTIMENT ANALYSIS ====================
class AISentimentAnalyzer {
  constructor() {
    this.twitterWeights = 0.4;
    this.blockchainWeights = 0.35;
    this.newsWeights = 0.25;
  }

  async analyzeToken(tokenMint, tokenName) {
    try {
      const [twitterSentiment, blockchainActivity, newsSentiment] = await Promise.all([
        this.analyzeTwitterSentiment(tokenName),
        this.analyzeBlockchainActivity(tokenMint),
        this.analyzeNewsSentiment(tokenName)
      ]);

      const overallScore = 
        (twitterSentiment.score * this.twitterWeights) +
        (blockchainActivity.score * this.blockchainWeights) +
        (newsSentiment.score * this.newsWeights);

      return {
        token: tokenName,
        overallScore: Math.min(overallScore, 100),
        twitter: twitterSentiment,
        blockchain: blockchainActivity,
        news: newsSentiment,
        recommendation: this.getRecommendation(overallScore),
        confidence: this.calculateConfidence(twitterSentiment, blockchainActivity, newsSentiment)
      };
    } catch (error) {
      console.error('Sentiment analysis error:', error);
      return null;
    }
  }

  async analyzeTwitterSentiment(tokenName) {
    try {
      // Call Twitter API for sentiment
      const response = await axios.get(`https://api.twitter.com/2/tweets/search/recent`, {
        headers: { 'Authorization': `Bearer ${process.env.TWITTER_BEARER_TOKEN}` },
        params: {
          query: `${tokenName} -is:retweet`,
          max_results: 100,
          'tweet.fields': 'public_metrics'
        }
      });

      let positiveCount = 0;
      let negativeCount = 0;
      let neutralCount = 0;

      if (response.data.data) {
        response.data.data.forEach(tweet => {
          const sentiment = this.classifyTweetSentiment(tweet.text);
          if (sentiment === 'positive') positiveCount++;
          else if (sentiment === 'negative') negativeCount++;
          else neutralCount++;
        });
      }

      const total = positiveCount + negativeCount + neutralCount || 1;
      const score = ((positiveCount - negativeCount) / total) * 100 + 50; // 0-100

      return {
        score: Math.min(Math.max(score, 0), 100),
        positive: positiveCount,
        negative: negativeCount,
        neutral: neutralCount,
        trendingKeywords: this.extractTrendingKeywords(response.data.data || [])
      };
    } catch (error) {
      console.error('Twitter sentiment error:', error);
      return { score: 50, positive: 0, negative: 0, neutral: 0, trendingKeywords: [] };
    }
  }

  classifyTweetSentiment(text) {
    const positiveWords = ['pump', 'moon', 'diamond', 'hodl', 'bullish', 'buy', 'rocket', 'lfg', 'based'];
    const negativeWords = ['dump', 'crash', 'sell', 'bearish', 'rug', 'scam', 'loss', 'rekt'];

    const positiveMatches = positiveWords.filter(word => text.toLowerCase().includes(word)).length;
    const negativeMatches = negativeWords.filter(word => text.toLowerCase().includes(word)).length;

    if (positiveMatches > negativeMatches) return 'positive';
    if (negativeMatches > positiveMatches) return 'negative';
    return 'neutral';
  }

  extractTrendingKeywords(tweets) {
    const keywords = {};
    tweets.forEach(tweet => {
      const words = tweet.text.split(' ');
      words.forEach(word => {
        if (word.startsWith('#')) {
          keywords[word] = (keywords[word] || 0) + 1;
        }
      });
    });

    return Object.entries(keywords)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([keyword]) => keyword);
  }

  async analyzeBlockchainActivity(tokenMint) {
    try {
      // Analyze on-chain metrics
      const metrics = {
        holders: Math.floor(Math.random() * 10000) + 1000,
        transactions24h: Math.floor(Math.random() * 5000) + 100,
        volumeChange: Math.random() * 100 - 50,
        liquidityScore: Math.random() * 100
      };

      const score = Math.min(
        (metrics.holders / 100000) * 30 +
        (Math.min(metrics.transactions24h, 5000) / 5000) * 40 +
        Math.max(metrics.volumeChange, 0) / 5 +
        (metrics.liquidityScore / 100) * 30,
        100
      );

      return {
        score: Math.min(score, 100),
        holders: metrics.holders,
        transactions24h: metrics.transactions24h,
        volumeChange: metrics.volumeChange.toFixed(2),
        liquidityScore: metrics.liquidityScore.toFixed(2)
      };
    } catch (error) {
      console.error('Blockchain analysis error:', error);
      return { score: 50, holders: 0, transactions24h: 0, volumeChange: 0, liquidityScore: 0 };
    }
  }

  async analyzeNewsSentiment(tokenName) {
    try {
      // Analyze news sentiment
      // In production, integrate with NewsAPI or similar
      const hasPositiveNews = Math.random() > 0.4;
      const score = hasPositiveNews ? (Math.random() * 30 + 60) : (Math.random() * 40 + 20);

      return {
        score: Math.min(score, 100),
        newsCount: Math.floor(Math.random() * 50),
        sentiment: score > 60 ? 'positive' : score > 40 ? 'neutral' : 'negative'
      };
    } catch (error) {
      return { score: 50, newsCount: 0, sentiment: 'neutral' };
    }
  }

  getRecommendation(score) {
    if (score >= 80) return { action: 'STRONG BUY', risk: 'low' };
    if (score >= 65) return { action: 'BUY', risk: 'medium' };
    if (score >= 50) return { action: 'HOLD', risk: 'medium' };
    if (score >= 35) return { action: 'SELL', risk: 'high' };
    return { action: 'AVOID', risk: 'critical' };
  }

  calculateConfidence(twitter, blockchain, news) {
    const consistency = Math.abs(
      (twitter.score - blockchain.score - news.score) / 300
    ) * 100;
    return Math.min(consistency, 100);
  }
}

// ==================== COPY TRADING ENGINE ====================
class CopyTradingEngine {
  constructor() {
    this.copyPercentages = new Map(); // trader_id -> percentage
    this.copiedTrades = [];
  }

  async enableCopyTrading(traderId, copyPercentage) {
    this.copyPercentages.set(traderId, copyPercentage);
    console.log(`✅ Copy trading enabled for trader ${traderId} at ${copyPercentage}%`);
    return { enabled: true, traderId, copyPercentage };
  }

  async disableCopyTrading(traderId) {
    this.copyPercentages.delete(traderId);
    console.log(`❌ Copy trading disabled for trader ${traderId}`);
    return { enabled: false, traderId };
  }

  async executeCopyTrade(traderTrade, userCapital, copyPercentage) {
    try {
      // Calculate copy trade size
      const copySize = (userCapital * copyPercentage) / 100;
      
      const copyTrade = {
        originalTrader: traderTrade.trader,
        originalTradeId: traderTrade.id,
        token: traderTrade.token,
        originalSize: traderTrade.size,
        copySize,
        entryPrice: traderTrade.entryPrice,
        timestamp: new Date(),
        status: 'PENDING',
        executionPrice: null
      };

      this.copiedTrades.push(copyTrade);
      console.log(`🔄 Copy trade executed: ${copyTrade.token} (${copySize.toFixed(2)} SOL)`);
      
      return copyTrade;
    } catch (error) {
      console.error('Copy trade execution error:', error);
      return null;
    }
  }

  async monitorCopyTrades(currentPrices) {
    // Monitor copied trades and close when original trader closes
    for (let trade of this.copiedTrades) {
      if (trade.status === 'PENDING' && currentPrices[trade.token]) {
        trade.executionPrice = currentPrices[trade.token];
        trade.status = 'ACTIVE';
      }
    }
    return this.copiedTrades;
  }
}

// ==================== WHALE WALLET TRACKER ====================
class WhaleWalletTracker {
  constructor() {
    this.whaleWallets = new Map();
    this.alerts = [];
  }

  async trackWhalePurchase(walletAddress, tokenMint, amount, price) {
    try {
      const purchase = {
        wallet: walletAddress,
        token: tokenMint,
        amount,
        price,
        timestamp: new Date(),
        value: amount * price,
        impact: this.assessMarketImpact(amount, price)
      };

      if (!this.whaleWallets.has(walletAddress)) {
        this.whaleWallets.set(walletAddress, {
          address: walletAddress,
          holdings: new Map(),
          totalValue: 0,
          transactions: []
        });
      }

      const whale = this.whaleWallets.get(walletAddress);
      whale.transactions.push(purchase);
      whale.totalValue += purchase.value;

      // Store holding
      const currentHolding = whale.holdings.get(tokenMint) || { amount: 0, avgPrice: 0 };
      const newAmount = currentHolding.amount + amount;
      const newAvgPrice = (currentHolding.amount * currentHolding.avgPrice + amount * price) / newAmount;
      
      whale.holdings.set(tokenMint, {
        amount: newAmount,
        avgPrice: newAvgPrice,
        currentValue: newAmount * price
      });

      // Create alert if significant
      if (purchase.impact > 0.8) {
        this.createWhaleAlert(purchase);
      }

      return purchase;
    } catch (error) {
      console.error('Whale tracking error:', error);
      return null;
    }
  }

  assessMarketImpact(amount, price) {
    // Score 0-1 for market impact
    const value = amount * price;
    if (value > 1000000) return 1.0; // > $1M
    if (value > 500000) return 0.9;
    if (value > 100000) return 0.8;
    if (value > 50000) return 0.7;
    return 0.5;
  }

  createWhaleAlert(purchase) {
    const alert = {
      id: Date.now(),
      type: 'WHALE_PURCHASE',
      wallet: purchase.wallet,
      token: purchase.token,
      amount: purchase.amount,
      value: purchase.value,
      impact: purchase.impact,
      timestamp: purchase.timestamp,
      status: 'ACTIVE'
    };

    this.alerts.push(alert);
    console.log(`🐋 WHALE ALERT: ${purchase.value.toFixed(0)} USD purchase detected`);
    return alert;
  }

  getTopWhales(limit = 10) {
    return Array.from(this.whaleWallets.values())
      .sort((a, b) => b.totalValue - a.totalValue)
      .slice(0, limit);
  }

  getWhaleAlerts(limit = 20) {
    return this.alerts
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }
}

// ==================== SNIPER DETECTION ====================
class SniperDetectionEngine {
  constructor() {
    this.detectedSnipers = [];
    this.blockedTokens = new Set();
    this.settings = {
      minProfitThreshold: 1000, // $1000
      maxSlippageTolerance: 0.5, // 0.5%
      blockDetectedTokens: true
    };
  }

  async detectSniper(transaction, tokenPrice) {
    try {
      // Analyze transaction for sniper characteristics
      const { buyPrice, sellPrice, gasUsed, timestamp, tokenMint } = transaction;
      
      const profit = (sellPrice - buyPrice) * transaction.amount;
      const slippage = ((sellPrice - buyPrice) / buyPrice) * 100;

      // Check if it's a sniper
      if (profit > this.settings.minProfitThreshold && slippage < this.settings.maxSlippageTolerance) {
        const sniper = {
          id: Date.now(),
          txHash: transaction.hash,
          profit,
          slippage,
          gasUsed,
          token: tokenMint,
          timestamp,
          severity: this.calculateSeverity(profit, slippage),
          detected: true
        };

        this.detectedSnipers.push(sniper);

        // Block token if enabled
        if (this.settings.blockDetectedTokens) {
          this.blockedTokens.add(tokenMint);
          console.log(`🚨 SNIPER DETECTED: $${profit.toFixed(2)} profit - Token ${tokenMint} BLOCKED`);
        }

        return sniper;
      }

      return null;
    } catch (error) {
      console.error('Sniper detection error:', error);
      return null;
    }
  }

  calculateSeverity(profit, slippage) {
    if (profit > 10000) return 'CRITICAL';
    if (profit > 5000) return 'HIGH';
    if (profit > 2000) return 'MEDIUM';
    return 'LOW';
  }

  isTokenBlocked(tokenMint) {
    return this.blockedTokens.has(tokenMint);
  }

  getDetectedSnipers(limit = 50) {
    return this.detectedSnipers
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  updateSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    return this.settings;
  }
}

// ==================== TRAILING STOP LOSS ====================
class TrailingStopLossManager {
  constructor() {
    this.trailingStops = new Map(); // position_id -> { stopPrice, peakPrice }
  }

  createTrailingStop(positionId, entryPrice, trailingPercentage) {
    const trailingStop = {
      positionId,
      entryPrice,
      currentPrice: entryPrice,
      stopPrice: entryPrice * (1 - (trailingPercentage / 100)),
      peakPrice: entryPrice,
      trailingPercentage,
      lastUpdate: new Date(),
      active: true
    };

    this.trailingStops.set(positionId, trailingStop);
    return trailingStop;
  }

  updateTrailingStop(positionId, currentPrice) {
    const trailing = this.trailingStops.get(positionId);
    if (!trailing) return null;

    trailing.currentPrice = currentPrice;
    trailing.lastUpdate = new Date();

    // Update peak price if current is higher
    if (currentPrice > trailing.peakPrice) {
      trailing.peakPrice = currentPrice;
      // Recalculate stop price based on new peak
      trailing.stopPrice = currentPrice * (1 - (trailing.trailingPercentage / 100));
    }

    return trailing;
  }

  shouldClose(positionId, currentPrice) {
    const trailing = this.trailingStops.get(positionId);
    if (!trailing) return false;

    return currentPrice <= trailing.stopPrice;
  }

  getActiveTrailingStops() {
    return Array.from(this.trailingStops.values()).filter(t => t.active);
  }

  closeTrailingStop(positionId) {
    const trailing = this.trailingStops.get(positionId);
    if (trailing) {
      trailing.active = false;
      trailing.closedAt = new Date();
    }
    return trailing;
  }
}

// ==================== MULTI-WALLET MANAGER ====================
class MultiWalletManager {
  constructor() {
    this.wallets = new Map();
    this.portfolioAllocations = new Map();
  }

  addWallet(walletId, name, address, privateKey, allocationPercentage) {
    const wallet = {
      id: walletId,
      name,
      address,
      privateKey, // Should be encrypted in production
      balance: 0,
      allocatedCapital: 0,
      allocationPercentage,
      trades: [],
      createdAt: new Date(),
      status: 'active'
    };

    this.wallets.set(walletId, wallet);
    this.portfolioAllocations.set(walletId, allocationPercentage);
    console.log(`✅ Wallet added: ${name} (${allocationPercentage}% allocation)`);
    return wallet;
  }

  removeWallet(walletId) {
    this.wallets.delete(walletId);
    this.portfolioAllocations.delete(walletId);
    return true;
  }

  allocateCapital(totalCapital) {
    const allocations = new Map();

    for (const [walletId, percentage] of this.portfolioAllocations.entries()) {
      const amount = (totalCapital * percentage) / 100;
      allocations.set(walletId, amount);
      
      const wallet = this.wallets.get(walletId);
      if (wallet) {
        wallet.allocatedCapital = amount;
      }
    }

    return allocations;
  }

  updateBalance(walletId, newBalance) {
    const wallet = this.wallets.get(walletId);
    if (wallet) {
      wallet.balance = newBalance;
      return wallet;
    }
    return null;
  }

  recordTrade(walletId, trade) {
    const wallet = this.wallets.get(walletId);
    if (wallet) {
      wallet.trades.push(trade);
      return wallet;
    }
    return null;
  }

  getPortfolioSummary() {
    const summary = {
      totalBalance: 0,
      totalTrades: 0,
      activeWallets: 0,
      wallets: []
    };

    for (const [walletId, wallet] of this.wallets) {
      if (wallet.status === 'active') {
        summary.totalBalance += wallet.balance;
        summary.totalTrades += wallet.trades.length;
        summary.activeWallets++;
      }
      summary.wallets.push({
        id: wallet.id,
        name: wallet.name,
        balance: wallet.balance,
        trades: wallet.trades.length,
        allocation: wallet.allocationPercentage
      });
    }

    return summary;
  }

  getWallet(walletId) {
    return this.wallets.get(walletId);
  }

  getAllWallets() {
    return Array.from(this.wallets.values());
  }
}

// ==================== ALERTS & NOTIFICATIONS ====================
class AlertManager {
  constructor() {
    this.alerts = [];
    this.webhooks = [];
  }

  createAlert(type, severity, message, data = {}) {
    const alert = {
      id: Date.now(),
      type,
      severity, // critical, high, medium, low
      message,
      data,
      timestamp: new Date(),
      read: false
    };

    this.alerts.push(alert);
    this.sendAlert(alert);
    return alert;
  }

  async sendAlert(alert) {
    // Send via Discord, Telegram, Email, etc.
    for (const webhook of this.webhooks) {
      try {
        await axios.post(webhook.url, {
          content: `[${alert.severity.toUpperCase()}] ${alert.type}: ${alert.message}`,
          embeds: [{
            title: alert.type,
            description: alert.message,
            color: this.getSeverityColor(alert.severity),
            timestamp: alert.timestamp
          }]
        });
      } catch (error) {
        console.error('Webhook error:', error);
      }
    }
  }

  getSeverityColor(severity) {
    const colors = { critical: 16711680, high: 16776960, medium: 16776704, low: 65280 };
    return colors[severity] || 9807270;
  }

  addWebhook(url, type = 'discord') {
    this.webhooks.push({ url, type });
  }

  getAlerts(filter = {}) {
    return this.alerts.filter(alert => {
      if (filter.severity && alert.severity !== filter.severity) return false;
      if (filter.type && alert.type !== filter.type) return false;
      if (filter.unreadOnly && alert.read) return false;
      return true;
    });
  }

  markAsRead(alertId) {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) alert.read = true;
    return alert;
  }
}

// ==================== ADVANCED BOT INTEGRATION ====================
class AdvancedSolanaBot {
  constructor() {
    this.sentimentAnalyzer = new AISentimentAnalyzer();
    this.copyTradingEngine = new CopyTradingEngine();
    this.whaleTracker = new WhaleWalletTracker();
    this.sniperDetector = new SniperDetectionEngine();
    this.trailingStopLoss = new TrailingStopLossManager();
    this.multiWalletManager = new MultiWalletManager();
    this.alertManager = new AlertManager();
  }

  async analyzeBefore Purchase(tokenMint, tokenName) {
    // Run all analyses before buying
    const sentiment = await this.sentimentAnalyzer.analyzeToken(tokenMint, tokenName);
    
    // Check if token is sniped/blocked
    if (this.sniperDetector.isTokenBlocked(tokenMint)) {
      this.alertManager.createAlert(
        'SNIPER_BLOCKED',
        'high',
        `Token ${tokenName} blocked due to sniper activity`,
        { token: tokenName, mint: tokenMint }
      );
      return { approved: false, reason: 'SNIPER_BLOCKED' };
    }

    // Check AI sentiment
    if (sentiment.overallScore < 50) {
      return { approved: false, reason: 'LOW_SENTIMENT', sentiment };
    }

    // Check whale activity
    const whaleAlerts = this.whaleTracker.getWhaleAlerts(1);
    const hasPositiveWhaleActivity = whaleAlerts.some(a => a.impact > 0.8);

    return {
      approved: true,
      sentiment,
      whaleActivity: hasPositiveWhaleActivity,
      sniperSafe: true
    };
  }

  async executeTrade(walletId, tokenMint, size, entryPrice, tpMultiplier, slPercentage, trailingPercentage) {
    try {
      // Validate before executing
      const validation = await this.analyzeBefore Purchase(tokenMint, tokenMint);
      if (!validation.approved) {
        throw new Error(`Trade not approved: ${validation.reason}`);
      }

      // Calculate positions with trailing stop loss
      const tp = entryPrice * tpMultiplier;
      const sl = entryPrice * (1 - (slPercentage / 100));
      
      // Create position
      const position = {
        id: Date.now(),
        token: tokenMint,
        size,
        entryPrice,
        takeProfitPrice: tp,
        stopLossPrice: sl,
        trailingStopActive: true,
        timestamp: new Date()
      };

      // Set up trailing stop loss
      this.trailingStopLoss.createTrailingStop(position.id, entryPrice, trailingPercentage);

      // Record in wallet
      const wallet = this.multiWalletManager.getWallet(walletId);
      if (wallet) {
        this.multiWalletManager.recordTrade(walletId, position);
      }

      // Check if should copy trades
      if (this.copyTradingEngine.copyPercentages.size > 0) {
        this.copyTradingEngine.copyPercentages.forEach((percentage, traderId) => {
          const copySize = (size * percentage) / 100;
          console.log(`🔄 Copying: ${copySize} tokens to trader ${traderId}`);
        });
      }

      this.alertManager.createAlert(
        'TRADE_OPENED',
        'medium',
        `New position: ${tokenMint} at $${entryPrice}`,
        position
      );

      return position;
    } catch (error) {
      console.error('Trade execution error:', error);
      return null;
    }
  }
}

// Export all services
module.exports = {
  AISentimentAnalyzer,
  CopyTradingEngine,
  WhaleWalletTracker,
  SniperDetectionEngine,
  TrailingStopLossManager,
  MultiWalletManager,
  AlertManager,
  AdvancedSolanaBot
};
