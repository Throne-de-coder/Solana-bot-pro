// telegram-alerts-service.js - Telegram Bot Alerts Integration
const axios = require('axios');

// ==================== TELEGRAM ALERTS SERVICE ====================
class TelegramAlertsService {
  constructor(botToken, chatId) {
    this.botToken = botToken;
    this.chatId = chatId;
    this.apiUrl = `https://api.telegram.org/bot${botToken}`;
    this.alertHistory = [];
    this.failedAlerts = [];
    this.isConnected = false;
  }

  /**
   * Test connection to Telegram
   */
  async testConnection() {
    try {
      const response = await axios.get(`${this.apiUrl}/getMe`);
      this.isConnected = true;
      console.log(`✅ Telegram Bot Connected: ${response.data.result.first_name}`);
      return { success: true, botName: response.data.result.first_name };
    } catch (error) {
      this.isConnected = false;
      console.error('❌ Telegram Connection Failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send text message
   */
  async sendMessage(text, parseMode = 'HTML') {
    try {
      if (!this.isConnected) {
        throw new Error('Telegram not connected');
      }

      const response = await axios.post(`${this.apiUrl}/sendMessage`, {
        chat_id: this.chatId,
        text,
        parse_mode: parseMode
      });

      this.alertHistory.push({
        type: 'message',
        text,
        timestamp: new Date(),
        status: 'sent',
        messageId: response.data.result.message_id
      });

      return { success: true, messageId: response.data.result.message_id };
    } catch (error) {
      this.failedAlerts.push({
        type: 'message',
        text,
        timestamp: new Date(),
        error: error.message
      });
      console.error('Failed to send Telegram message:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Trade opened alert
   */
  async alertTradeOpened(token, entryPrice, takeProfitPrice, stopLossPrice, size) {
    const message = `
<b>🟢 NEW TRADE OPENED</b>

<b>Token:</b> <code>${token}</code>
<b>Entry Price:</b> $${entryPrice.toFixed(8)}
<b>Take Profit:</b> $${takeProfitPrice.toFixed(8)}
<b>Stop Loss:</b> $${stopLossPrice.toFixed(8)}
<b>Position Size:</b> ${size.toFixed(2)} SOL

<b>TP Target:</b> ${((takeProfitPrice - entryPrice) / entryPrice * 100).toFixed(1)}%
<b>Risk/Reward:</b> ${((takeProfitPrice - entryPrice) / (entryPrice - stopLossPrice)).toFixed(2)}x

⏰ ${new Date().toLocaleTimeString()}
`;
    return this.sendMessage(message);
  }

  /**
   * Trade closed alert
   */
  async alertTradeClosed(token, entryPrice, exitPrice, pnl, pnlPercentage, reason) {
    const emoji = pnl > 0 ? '✅' : '❌';
    const color = pnl > 0 ? '🟢' : '🔴';

    const message = `
${emoji} <b>TRADE CLOSED</b> ${color}

<b>Token:</b> <code>${token}</code>
<b>Entry Price:</b> $${entryPrice.toFixed(8)}
<b>Exit Price:</b> $${exitPrice.toFixed(8)}

<b>Profit/Loss:</b> $${pnl.toFixed(2)}
<b>Return:</b> ${pnlPercentage > 0 ? '+' : ''}${pnlPercentage.toFixed(2)}%

<b>Close Reason:</b> ${reason}

⏰ ${new Date().toLocaleTimeString()}
`;
    return this.sendMessage(message);
  }

  /**
   * Whale activity alert
   */
  async alertWhaleActivity(walletAddress, action, tokenName, amount, usdValue, impact) {
    const message = `
<b>🐋 WHALE ACTIVITY DETECTED</b>

<b>Wallet:</b> <code>${walletAddress}</code>
<b>Action:</b> <b>${action}</b>
<b>Token:</b> ${tokenName}
<b>Amount:</b> ${amount.toLocaleString()}
<b>Value:</b> $${usdValue.toLocaleString()}

<b>Market Impact:</b> ${(impact * 100).toFixed(1)}%
${impact > 0.8 ? '⚠️ <b>HIGH IMPACT</b>' : ''}

⏰ ${new Date().toLocaleTimeString()}
`;
    return this.sendMessage(message);
  }

  /**
   * Sniper detection alert
   */
  async alertSniperDetected(tokenName, sniperProfit, transactionHash, severity) {
    const emoji = severity === 'CRITICAL' ? '🚨' : severity === 'HIGH' ? '⚠️' : '🔔';
    
    const message = `
${emoji} <b>SNIPER DETECTED</b>

<b>Token:</b> ${tokenName}
<b>Sniper Profit:</b> $${sniperProfit.toFixed(2)}
<b>Severity:</b> <b>${severity}</b>

<b>TX Hash:</b> <code>${transactionHash}</code>

<b>Action:</b> Token automatically <b>BLOCKED</b> ❌

⏰ ${new Date().toLocaleTimeString()}
`;
    return this.sendMessage(message);
  }

  /**
   * AI Sentiment alert
   */
  async alertSentimentChange(tokenName, newScore, previousScore, recommendation) {
    const trend = newScore > previousScore ? '📈' : '📉';
    const trendText = newScore > previousScore ? 'IMPROVED' : 'DECLINED';

    const message = `
${trend} <b>SENTIMENT CHANGE</b>

<b>Token:</b> ${tokenName}
<b>Previous Score:</b> ${previousScore}/100
<b>New Score:</b> ${newScore}/100
<b>Trend:</b> <b>${trendText}</b>

<b>Recommendation:</b> ${recommendation.action}
<b>Risk Level:</b> ${recommendation.risk}

⏰ ${new Date().toLocaleTimeString()}
`;
    return this.sendMessage(message);
  }

  /**
   * Copy trade alert
   */
  async alertCopyTrade(traderName, tokenName, tradeType, size, price) {
    const message = `
<b>📋 COPIED TRADE EXECUTED</b>

<b>Original Trader:</b> ${traderName}
<b>Token:</b> ${tokenName}
<b>Trade Type:</b> ${tradeType}
<b>Position Size:</b> ${size.toFixed(2)}
<b>Entry Price:</b> $${price.toFixed(8)}

✅ Trade executed successfully

⏰ ${new Date().toLocaleTimeString()}
`;
    return this.sendMessage(message);
  }

  /**
   * Trailing stop loss hit alert
   */
  async alertTrailingStopLossHit(tokenName, currentPrice, trailingStopPrice, profit) {
    const message = `
<b>📉 TRAILING STOP LOSS TRIGGERED</b>

<b>Token:</b> ${tokenName}
<b>Current Price:</b> $${currentPrice.toFixed(8)}
<b>Trailing Stop:</b> $${trailingStopPrice.toFixed(8)}

<b>Locked Profit:</b> $${profit.toFixed(2)}

✅ Position closed to protect gains

⏰ ${new Date().toLocaleTimeString()}
`;
    return this.sendMessage(message);
  }

  /**
   * Profit milestone alert
   */
  async alertProfitMilestone(totalProfit, tradesCompleted, winRate) {
    const message = `
<b>🎉 PROFIT MILESTONE REACHED!</b>

<b>Total Profit:</b> $${totalProfit.toFixed(2)}
<b>Trades Completed:</b> ${tradesCompleted}
<b>Win Rate:</b> ${winRate.toFixed(1)}%

🚀 Keep up the great trading!

⏰ ${new Date().toLocaleTimeString()}
`;
    return this.sendMessage(message);
  }

  /**
   * Daily report alert
   */
  async sendDailyReport(stats) {
    const message = `
<b>📊 DAILY TRADING REPORT</b>

<b>Date:</b> ${new Date().toLocaleDateString()}

<b>Statistics:</b>
🔹 Total P&L: $${stats.totalPnL.toFixed(2)}
🔹 Trades Executed: ${stats.tradesCount}
🔹 Win Rate: ${stats.winRate.toFixed(1)}%
🔹 Best Trade: +${stats.bestTrade.toFixed(2)}%
🔹 Worst Trade: ${stats.worstTrade.toFixed(2)}%

<b>Summary:</b>
${stats.totalPnL > 0 ? '✅ Profitable day!' : '❌ Losing day'}
Profit Factor: ${stats.profitFactor.toFixed(2)}x

⏰ Report sent at ${new Date().toLocaleTimeString()}
`;
    return this.sendMessage(message);
  }

  /**
   * Send document/chart
   */
  async sendChart(fileUrl, caption) {
    try {
      const response = await axios.post(`${this.apiUrl}/sendPhoto`, {
        chat_id: this.chatId,
        photo: fileUrl,
        caption,
        parse_mode: 'HTML'
      });

      return { success: true, messageId: response.data.result.message_id };
    } catch (error) {
      console.error('Failed to send chart:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get alert history
   */
  getAlertHistory(limit = 50) {
    return this.alertHistory.slice(-limit);
  }

  /**
   * Get failed alerts
   */
  getFailedAlerts(limit = 20) {
    return this.failedAlerts.slice(-limit);
  }

  /**
   * Get statistics
   */
  getStatistics() {
    const successCount = this.alertHistory.filter(a => a.status === 'sent').length;
    const totalAlerts = successCount + this.failedAlerts.length;

    return {
      totalSent: successCount,
      failedAlerts: this.failedAlerts.length,
      successRate: totalAlerts > 0 ? ((successCount / totalAlerts) * 100).toFixed(1) : '0',
      isConnected: this.isConnected
    };
  }

  /**
   * Clear history
   */
  clearHistory() {
    this.alertHistory = [];
    this.failedAlerts = [];
  }
}

// ==================== ADVANCED ALERTS MANAGER ====================
class AdvancedAlertsManager {
  constructor() {
    this.telegramServices = new Map();
    this.discordWebhooks = [];
    this.emailAlerts = [];
    this.pushNotifications = [];
  }

  /**
   * Add Telegram bot
   */
  addTelegramBot(botToken, chatId, botName = 'Default') {
    const service = new TelegramAlertsService(botToken, chatId);
    this.telegramServices.set(botName, service);
    return service;
  }

  /**
   * Get Telegram service
   */
  getTelegramService(botName = 'Default') {
    return this.telegramServices.get(botName);
  }

  /**
   * Send alert to all channels
   */
  async broadcastAlert(alertData, channels = ['telegram', 'discord', 'email']) {
    const results = {};

    // Send to Telegram
    if (channels.includes('telegram')) {
      for (const [name, service] of this.telegramServices) {
        try {
          const result = await this.sendToTelegram(service, alertData);
          results[`telegram_${name}`] = result;
        } catch (error) {
          results[`telegram_${name}`] = { success: false, error: error.message };
        }
      }
    }

    // Send to Discord
    if (channels.includes('discord')) {
      results.discord = await this.sendToDiscord(alertData);
    }

    // Send via Email
    if (channels.includes('email')) {
      results.email = await this.sendEmail(alertData);
    }

    return results;
  }

  /**
   * Route to appropriate Telegram method
   */
  async sendToTelegram(service, alertData) {
    switch (alertData.type) {
      case 'TRADE_OPENED':
        return service.alertTradeOpened(
          alertData.token,
          alertData.entryPrice,
          alertData.takeProfitPrice,
          alertData.stopLossPrice,
          alertData.size
        );
      case 'TRADE_CLOSED':
        return service.alertTradeClosed(
          alertData.token,
          alertData.entryPrice,
          alertData.exitPrice,
          alertData.pnl,
          alertData.pnlPercentage,
          alertData.reason
        );
      case 'WHALE_ACTIVITY':
        return service.alertWhaleActivity(
          alertData.wallet,
          alertData.action,
          alertData.token,
          alertData.amount,
          alertData.usdValue,
          alertData.impact
        );
      case 'SNIPER_DETECTED':
        return service.alertSniperDetected(
          alertData.token,
          alertData.profit,
          alertData.txHash,
          alertData.severity
        );
      case 'SENTIMENT_CHANGE':
        return service.alertSentimentChange(
          alertData.token,
          alertData.newScore,
          alertData.previousScore,
          alertData.recommendation
        );
      case 'COPY_TRADE':
        return service.alertCopyTrade(
          alertData.traderName,
          alertData.token,
          alertData.tradeType,
          alertData.size,
          alertData.price
        );
      case 'TRAILING_SL_HIT':
        return service.alertTrailingStopLossHit(
          alertData.token,
          alertData.currentPrice,
          alertData.trailingStop,
          alertData.profit
        );
      case 'PROFIT_MILESTONE':
        return service.alertProfitMilestone(
          alertData.totalProfit,
          alertData.tradesCompleted,
          alertData.winRate
        );
      case 'DAILY_REPORT':
        return service.sendDailyReport(alertData.stats);
      default:
        return service.sendMessage(JSON.stringify(alertData));
    }
  }

  /**
   * Send to Discord (placeholder)
   */
  async sendToDiscord(alertData) {
    // Discord implementation would go here
    return { success: true };
  }

  /**
   * Send email alert (placeholder)
   */
  async sendEmail(alertData) {
    // Email implementation would go here
    return { success: true };
  }

  /**
   * Get all statistics
   */
  getAllStatistics() {
    const stats = {};
    for (const [name, service] of this.telegramServices) {
      stats[name] = service.getStatistics();
    }
    return stats;
  }
}

// ==================== TELEGRAM BOT INITIALIZATION ====================
async function initializeTelegramAlerts(botToken, chatId) {
  const alertsManager = new AdvancedAlertsManager();
  const telegramService = alertsManager.addTelegramBot(botToken, chatId);

  // Test connection
  const connection = await telegramService.testConnection();
  if (!connection.success) {
    console.error('Failed to initialize Telegram alerts:', connection.error);
    return null;
  }

  console.log('✅ Telegram alerts initialized successfully');
  return alertsManager;
}

module.exports = {
  TelegramAlertsService,
  AdvancedAlertsManager,
  initializeTelegramAlerts
};
