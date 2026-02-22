const { searchSenatorTransactions } = require("../services/senatorTransactionService");

const getSenatorTransactions = async (request, response) => {
  const { firstName, lastName, startDate, endDate } = request.query;

  // If both names are provided, require both; if neither, get all; otherwise require both
  if ((firstName && !lastName) || (!firstName && lastName)) {
    return response.status(400).json({
      error: "Provide both firstName and lastName, or leave both blank for all senators",
    });
  }

  if (!startDate || !endDate) {
    return response.status(400).json({
      error: "startDate and endDate are required",
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
    const results = await searchSenatorTransactions(
      firstName,
      lastName,
      startDate,
      endDate
    );

    return response.status(200).json({
      senator: {
        firstName,
        lastName,
      },
      dateRange: {
        startDate,
        endDate,
      },
      results,
      count: results.length,
    });
  } catch (error) {
    console.error("Senator transactions error:", error);
    return response.status(500).json({
      error: error.message || "Failed to search senator transactions",
    });
  }
};

module.exports = {
  getSenatorTransactions,
};
