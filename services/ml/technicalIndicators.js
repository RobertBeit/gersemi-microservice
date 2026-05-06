// src/services/technicalIndicators.js
// This file contains functions for calculating various technical indicators

/**
 * Calculates Simple Moving Average
 * @param {Array} data - Array of price data
 * @param {Number} period - Period for SMA calculation
 * @returns {Array} - Array of SMA values
 */
export const calculateSMA = (data, period) => {
    const sma = [];
    
    // Fill initial positions with NaN
    for (let i = 0; i < period - 1; i++) {
      sma.push(NaN);
    }
    
    // Calculate SMA for each period
    for (let i = period - 1; i < data.length; i++) {
      let sum = 0;
      for (let j = 0; j < period; j++) {
        sum += data[i - j];
      }
      sma.push(sum / period);
    }
    
    return sma;
  };
  
  /**
   * Calculates Exponential Moving Average
   * @param {Array} data - Array of price data
   * @param {Number} period - Period for EMA calculation
   * @returns {Array} - Array of EMA values
   */
  export const calculateEMA = (data, period) => {
    const ema = [];
    const multiplier = 2 / (period + 1);
    
    // Start with SMA for the first EMA value
    let initialSMA = 0;
    for (let i = 0; i < period; i++) {
      initialSMA += data[i];
    }
    initialSMA /= period;
    
    // Fill initial positions with NaN
    for (let i = 0; i < period - 1; i++) {
      ema.push(NaN);
    }
    
    // First EMA is the SMA
    ema.push(initialSMA);
    
    // Calculate EMA for remaining data
    for (let i = period; i < data.length; i++) {
      ema.push((data[i] - ema[ema.length - 1]) * multiplier + ema[ema.length - 1]);
    }
    
    return ema;
  };
  
  /**
   * Calculates Moving Average Convergence Divergence (MACD)
   * @param {Array} data - Array of price data
   * @param {Number} fastPeriod - Fast EMA period (default: 12)
   * @param {Number} slowPeriod - Slow EMA period (default: 26)
   * @param {Number} signalPeriod - Signal line period (default: 9)
   * @returns {Object} - Object containing MACD line, signal line, and histogram
   */
  export const calculateMACD = (data, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) => {
    const fastEMA = calculateEMA(data, fastPeriod);
    const slowEMA = calculateEMA(data, slowPeriod);
    
    // Calculate MACD line (fast EMA - slow EMA)
    const macdLine = [];
    for (let i = 0; i < data.length; i++) {
      if (isNaN(fastEMA[i]) || isNaN(slowEMA[i])) {
        macdLine.push(NaN);
      } else {
        macdLine.push(fastEMA[i] - slowEMA[i]);
      }
    }
    
    // Calculate signal line (EMA of MACD line)
    // First filter out NaN values for signal calculation
    const validMacdValues = macdLine.filter(val => !isNaN(val));
    const signalLine = calculateEMA(validMacdValues, signalPeriod);
    
    // Prepare final signal line with proper alignment
    const fullSignalLine = [];
    for (let i = 0; i < data.length - validMacdValues.length; i++) {
      fullSignalLine.push(NaN);
    }
    fullSignalLine.push(...signalLine);
    
    // Calculate histogram (MACD line - signal line)
    const histogram = [];
    for (let i = 0; i < data.length; i++) {
      if (isNaN(macdLine[i]) || isNaN(fullSignalLine[i])) {
        histogram.push(NaN);
      } else {
        histogram.push(macdLine[i] - fullSignalLine[i]);
      }
    }
    
    return {
      macdLine,
      signalLine: fullSignalLine,
      histogram
    };
  };
  
  /**
   * Calculates Relative Strength Index (RSI)
   * @param {Array} data - Array of price data
   * @param {Number} period - Period for RSI calculation (default: 14)
   * @returns {Array} - Array of RSI values
   */
  export const calculateRSI = (data, period = 14) => {
    const rsi = [];
    const gains = [];
    const losses = [];
    
    // Calculate initial price changes
    for (let i = 1; i < data.length; i++) {
      const change = data[i] - data[i - 1];
      gains.push(change > 0 ? change : 0);
      losses.push(change < 0 ? Math.abs(change) : 0);
    }
    
    // Fill initial positions with NaN (we need period+1 data points to calculate first RSI)
    for (let i = 0; i < period; i++) {
      rsi.push(NaN);
    }
    
    // Calculate first average gain and loss
    let avgGain = gains.slice(0, period).reduce((sum, val) => sum + val, 0) / period;
    let avgLoss = losses.slice(0, period).reduce((sum, val) => sum + val, 0) / period;
    
    // Calculate first RSI
    let rs = avgGain / (avgLoss === 0 ? 0.001 : avgLoss); // Avoid division by zero
    rsi.push(100 - (100 / (1 + rs)));
    
    // Calculate remaining RSI values using smoothed method
    for (let i = period; i < gains.length; i++) {
      avgGain = ((avgGain * (period - 1)) + gains[i]) / period;
      avgLoss = ((avgLoss * (period - 1)) + losses[i]) / period;
      
      rs = avgGain / (avgLoss === 0 ? 0.001 : avgLoss); // Avoid division by zero
      rsi.push(100 - (100 / (1 + rs)));
    }
    
    return rsi;
  };
  
  /**
   * Detects potential bottom/peak patterns based on technical indicators
   * @param {Object} stockData - Object containing OHLCV data
   * @returns {Object} - Object with features data for LSTM
   */
  export const extractTechnicalFeatures = (stockData) => {
    const { close, high, low, volume } = stockData;
    
    // Calculate SMAs
    const sma20 = calculateSMA(close, 20);
    const sma50 = calculateSMA(close, 50);
    const sma200 = calculateSMA(close, 200);
    
    // Calculate MACD
    const macd = calculateMACD(close);
    
    // Calculate RSI
    const rsi = calculateRSI(close);
    
    // Calculate Volatility (20-day standard deviation of returns)
    const returns = [];
    returns.push(0); // First day has no return
    for (let i = 1; i < close.length; i++) {
      returns.push((close[i] / close[i - 1]) - 1);
    }
    
    const volatility = [];
    for (let i = 0; i < returns.length; i++) {
      if (i < 20) {
        volatility.push(NaN);
      } else {
        const windowReturns = returns.slice(i - 20, i);
        const mean = windowReturns.reduce((sum, val) => sum + val, 0) / 20;
        const squaredDiffs = windowReturns.map(val => Math.pow(val - mean, 2));
        const variance = squaredDiffs.reduce((sum, val) => sum + val, 0) / 20;
        volatility.push(Math.sqrt(variance));
      }
    }
    
    // Calculate volume ratio (current volume / 20-day avg volume)
    const volSMA20 = calculateSMA(volume, 20);
    const volumeRatio = volume.map((vol, i) => isNaN(volSMA20[i]) ? NaN : vol / volSMA20[i]);
    
    // Calculate price position (where current price is relative to its 52-week range)
    // Uses a growing window up to 252 days, starting once 20 data points are available
    const pricePosition = [];
    const maxLookback = 252;
    const minLookback = 20;
    
    for (let i = 0; i < close.length; i++) {
      if (i < minLookback - 1) {
        pricePosition.push(NaN);
      } else {
        const windowSize = Math.min(maxLookback, i + 1);
        const window = close.slice(i - windowSize + 1, i + 1);
        const min = Math.min(...window);
        const max = Math.max(...window);
        pricePosition.push(max === min ? 0.5 : (close[i] - min) / (max - min));
      }
    }
    
    // Pattern Indicators (1 for potential bottom, -1 for potential peak, 0 otherwise)
    const bottomSignals = [];
    const peakSignals = [];
    
    for (let i = 0; i < close.length; i++) {
      // Skip initial data where indicators are not available
      if (isNaN(sma20[i]) || isNaN(sma50[i]) || isNaN(sma200[i]) || 
          isNaN(macd.macdLine[i]) || isNaN(macd.signalLine[i]) || 
          isNaN(rsi[i]) || isNaN(volumeRatio[i])) {
        bottomSignals.push(0);
        peakSignals.push(0);
        continue;
      }
      
      // Bottom signals (multiple conditions should align)
      let isBottom = 0;
      // RSI oversold condition
      if (rsi[i] < 30) isBottom++;
      // Price below longer-term SMAs
      if (close[i] < sma50[i] && close[i] < sma200[i]) isBottom++;
      // MACD bullish crossover
      if (i > 0 && macd.histogram[i-1] < 0 && macd.histogram[i] > 0) isBottom++;
      // Increasing volume
      if (volumeRatio[i] > 1.5) isBottom++;
      // Price near 52-week low
      if (pricePosition[i] < 0.2) isBottom++;
      
      bottomSignals.push(isBottom >= 3 ? 1 : 0); // At least 3 conditions must be met
      
      // Peak signals (multiple conditions should align)
      let isPeak = 0;
      // RSI overbought condition
      if (rsi[i] > 70) isPeak++;
      // Price above longer-term SMAs with large margin
      if (close[i] > sma50[i] * 1.1 && close[i] > sma200[i] * 1.2) isPeak++;
      // MACD bearish crossover
      if (i > 0 && macd.histogram[i-1] > 0 && macd.histogram[i] < 0) isPeak++;
      // Decreasing volume on rallies
      if (close[i] > close[i-1] && volume[i] < volume[i-1]) isPeak++;
      // Price near 52-week high
      if (pricePosition[i] > 0.8) isPeak++;
      
      peakSignals.push(isPeak >= 3 ? 1 : 0); // At least 3 conditions must be met
    }
    
    // Compile all features into a single dataset
    const features = [];
    
    for (let i = 0; i < close.length; i++) {
      // Skip entries with NaN values
      if (isNaN(sma20[i]) || isNaN(sma50[i]) || isNaN(sma200[i]) || 
          isNaN(macd.macdLine[i]) || isNaN(macd.signalLine[i]) || 
          isNaN(rsi[i]) || isNaN(volatility[i]) || isNaN(volumeRatio[i]) || 
          isNaN(pricePosition[i])) {
        continue;
      }
      
      // Create feature vector
      features.push({
        date: stockData.dates[i],
        close: close[i],
        sma20Ratio: close[i] / sma20[i],
        sma50Ratio: close[i] / sma50[i],
        sma200Ratio: close[i] / sma200[i],
        macd: macd.macdLine[i],
        macdSignal: macd.signalLine[i],
        macdHistogram: macd.histogram[i],
        rsi: rsi[i],
        volatility: volatility[i],
        volumeRatio: volumeRatio[i],
        pricePosition: pricePosition[i],
        bottomSignal: bottomSignals[i],
        peakSignal: peakSignals[i]
      });
    }
    
    return features;
  };