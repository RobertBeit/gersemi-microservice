const { searchRepresentativeTransactions } = require("../services/representativeTransactionService");

const getRepresentativeTransactions = async (request, response) => {
  const {
    lastName = "",
    filingYear = "",
    state = "",
    district = "",
    startDate = "",
    endDate = "",
    searchType = "",
  } = request.query;

  const normalizedFilingYear = String(filingYear).trim();
  const normalizedStartDate = String(startDate).trim();
  const normalizedEndDate = String(endDate).trim();
  const normalizedSearchType = String(searchType || "").trim().toLowerCase();

  const hasFilingYear = Boolean(normalizedFilingYear);
  const hasDateRange = Boolean(normalizedStartDate || normalizedEndDate);

  if (!hasFilingYear && !(normalizedStartDate && normalizedEndDate)) {
    return response.status(400).json({
      error: "Provide filingYear, or both startDate and endDate",
    });
  }

  if (hasFilingYear && !/^\d{4}$/.test(normalizedFilingYear)) {
    return response.status(400).json({
      error: "filingYear must be in YYYY format",
    });
  }

  if (hasDateRange) {
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    if (!datePattern.test(normalizedStartDate) || !datePattern.test(normalizedEndDate)) {
      return response.status(400).json({
        error: "startDate and endDate must be in YYYY-MM-DD format",
      });
    }

    if (new Date(normalizedStartDate) > new Date(normalizedEndDate)) {
      return response.status(400).json({
        error: "startDate must be before or equal to endDate",
      });
    }
  }

  if (district && !/^\d{1,2}$/.test(String(district))) {
    return response.status(400).json({
      error: "district must be numeric when provided",
    });
  }

  if (normalizedSearchType && !["member", "candidate", "all"].includes(normalizedSearchType)) {
    return response.status(400).json({
      error: "searchType must be one of: member, candidate, all",
    });
  }

  try {
    const results = await searchRepresentativeTransactions({
      lastName: String(lastName).trim(),
      filingYear: normalizedFilingYear,
      state: String(state).trim(),
      district: String(district).trim(),
      startDate: normalizedStartDate,
      endDate: normalizedEndDate,
      searchType: normalizedSearchType || undefined,
    });

    return response.status(200).json({
      representativeQuery: {
        lastName,
        filingYear,
        state,
        district,
        startDate,
        endDate,
        searchType: normalizedSearchType || (String(lastName).trim() || String(state).trim() || String(district).trim() ? "member" : "all"),
      },
      results,
      count: results.length,
    });
  } catch (error) {
    console.error("Representative transactions error:", error);
    return response.status(500).json({
      error: error.message || "Failed to search representative transactions",
    });
  }
};

module.exports = {
  getRepresentativeTransactions,
};
