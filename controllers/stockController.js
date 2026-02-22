const { fetchHistoricalStockData } = require("../services/stockDataService");

const getStockData = async (request, response) => {
  const { symbol, startDate, endDate } = request.query;

  if (!symbol || !startDate || !endDate) {
    return response.status(400).json({
      error: "symbol, startDate, and endDate are required",
    });
  }

  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!datePattern.test(startDate) || !datePattern.test(endDate)) {
    return response.status(400).json({
      error: "startDate and endDate must be in YYYY-MM-DD format",
    });
  }

  if (new Date(startDate) > new Date(endDate)) {
    return response.status(400).json({
      error: "startDate must be before or equal to endDate",
    });
  }

  try {
    const data = await fetchHistoricalStockData(symbol, startDate, endDate);
    return response.status(200).json({
      symbol: symbol.toUpperCase(),
      startDate,
      endDate,
      data,
    });
  } catch (error) {
    return response.status(500).json({
      error: error.message || "Failed to fetch stock data",
    });
  }
};

module.exports = {
  getStockData,
};
