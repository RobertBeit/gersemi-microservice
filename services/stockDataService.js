const axios = require("axios");

const ALPHA_VANTAGE_URL =
  process.env.ALPHA_VANTAGE_URL || "https://www.alphavantage.co/query";
const POLYGON_URL = process.env.POLYGON_URL || "https://api.polygon.io";
const TWELVE_DATA_URL =
  process.env.TWELVE_DATA_URL || "https://api.twelvedata.com";

const fetchFromAlphaVantage = async (symbol, startDate, endDate) => {
  const apiKey = process.env.ALPHA_VANTAGE_KEY;

  if (!apiKey) {
    throw new Error("Missing ALPHA_VANTAGE_KEY in .env");
  }

  const response = await axios.get(ALPHA_VANTAGE_URL, {
    params: {
      function: "TIME_SERIES_DAILY_ADJUSTED",
      symbol: symbol.toUpperCase(),
      outputsize: "full",
      apikey: apiKey,
    },
    timeout: 30000,
  });

  if (response.data["Error Message"]) {
    throw new Error(`Alpha Vantage: ${response.data["Error Message"]}`);
  }
  if (response.data["Note"]) {
    throw new Error(`Alpha Vantage rate limit: ${response.data["Note"]}`);
  }
  if (!response.data["Time Series (Daily)"]) {
    throw new Error("Alpha Vantage: No time series data in response");
  }

  const timeSeriesData = response.data["Time Series (Daily)"];

  const rawData = Object.entries(timeSeriesData)
    .filter(([date]) => date >= startDate && date <= endDate)
    .map(([date, values]) => ({
      date,
      raw_open: parseFloat(values["1. open"]) || 0,
      raw_high: parseFloat(values["2. high"]) || 0,
      raw_low: parseFloat(values["3. low"]) || 0,
      raw_close: parseFloat(values["4. close"]) || 0,
      adjusted_close: parseFloat(values["5. adjusted close"]) || 0,
      volume: parseInt(values["6. volume"], 10) || 0,
      dividend_amount: parseFloat(values["7. dividend amount"]) || 0,
      split_coefficient: parseFloat(values["8. split coefficient"]) || 1,
    }))
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  if (rawData.length === 0) {
    throw new Error(`No data found for ${symbol} in date range`);
  }

  return rawData;
};

const fetchFromPolygon = async (symbol, startDate, endDate) => {
  const apiKey = process.env.POLYGON_KEY || process.env.MASSIVE_KEY;

  if (!apiKey) {
    throw new Error("Missing POLYGON_KEY in .env");
  }

  const response = await axios.get(
    `${POLYGON_URL}/v2/aggs/ticker/${symbol.toUpperCase()}/range/1/day/${startDate}/${endDate}`,
    {
      params: {
        adjusted: "true",
        sort: "asc",
        apiKey,
      },
      timeout: 30000,
    }
  );

  if (response.data.status === "ERROR") {
    throw new Error(`Polygon.io: ${response.data.error || "Unknown error"}`);
  }

  if (!response.data.results || response.data.results.length === 0) {
    throw new Error(`Polygon.io: No data found for ${symbol}`);
  }

  return response.data.results.map((item) => {
    const date = new Date(item.t).toISOString().split("T")[0];
    return {
      date,
      open: item.o,
      high: item.h,
      low: item.l,
      close: item.c,
      volume: item.v,
      raw_open: item.o,
      raw_high: item.h,
      raw_low: item.l,
      raw_close: item.c,
      adjusted_close: item.c,
      split_coefficient: 1,
      dividend_amount: 0,
      adjustment_factor: 1,
    };
  });
};

const fetchFromTwelveData = async (symbol, startDate, endDate) => {
  const apiKey = process.env.TWELVE_DATA_KEY;

  if (!apiKey) {
    throw new Error("Missing TWELVE_DATA_KEY in .env");
  }

  const response = await axios.get(`${TWELVE_DATA_URL}/time_series`, {
    params: {
      symbol: symbol.toUpperCase(),
      interval: "1day",
      start_date: startDate,
      end_date: endDate,
      apikey: apiKey,
      format: "JSON",
    },
    timeout: 30000,
  });

  if (response.data.status === "error") {
    throw new Error(`Twelve Data: ${response.data.message || "Unknown error"}`);
  }

  if (!response.data.values || response.data.values.length === 0) {
    throw new Error(`Twelve Data: No data found for ${symbol}`);
  }

  return response.data.values
    .map((item) => ({
      date: item.datetime,
      open: parseFloat(item.open),
      high: parseFloat(item.high),
      low: parseFloat(item.low),
      close: parseFloat(item.close),
      volume: parseInt(item.volume, 10) || 0,
      raw_open: parseFloat(item.open),
      raw_high: parseFloat(item.high),
      raw_low: parseFloat(item.low),
      raw_close: parseFloat(item.close),
      adjusted_close: parseFloat(item.close),
      split_coefficient: 1,
      dividend_amount: 0,
      adjustment_factor: 1,
    }))
    .sort((a, b) => new Date(a.date) - new Date(b.date));
};

const fetchHistoricalStockData = async (symbol, startDate, endDate) => {
  const providers = [
    { name: "Alpha Vantage", fetch: fetchFromAlphaVantage },
    { name: "Polygon.io", fetch: fetchFromPolygon },
    { name: "Twelve Data", fetch: fetchFromTwelveData },
  ];

  let lastError = null;

  for (const provider of providers) {
    try {
      return await provider.fetch(symbol, startDate, endDate);
    } catch (error) {
      lastError = error;
      if (error.message.includes("rate limit")) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }

  throw new Error(
    `All API providers failed. Last error: ${lastError?.message || "Unknown error"}`
  );
};

module.exports = {
  fetchHistoricalStockData,
};
