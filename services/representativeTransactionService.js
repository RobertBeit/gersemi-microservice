const axios = require("axios");
const { PDFParse } = require("pdf-parse");

const HOUSE_ORIGIN = "https://disclosures-clerk.house.gov";
const HOUSE_MEMBER_SEARCH_URL = `${HOUSE_ORIGIN}/FinancialDisclosure/ViewMemberSearchResult`;
const HOUSE_CANDIDATE_SEARCH_URL = `${HOUSE_ORIGIN}/FinancialDisclosure/ViewCandidateSearchResult`;

const stripTags = (value = "") => value
  .replace(/<[^>]*>/g, " ")
  .replace(/&nbsp;/g, " ")
  .replace(/&amp;/g, "&")
  .replace(/\s+/g, " ")
  .trim();

const parseResultRows = (html = "", filerType = "member") => {
  const rows = [];
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch = rowRegex.exec(html);

  while (rowMatch) {
    const rowHtml = rowMatch[1];
    const memberMatch = rowHtml.match(/class="(?:memberName|candidateName)"[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i)
      || rowHtml.match(/<td[^>]*data-label="Name"[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);

    if (memberMatch) {
      const filingMatch = rowHtml.match(/data-label="Filing"[^>]*>([\s\S]*?)<\/td>/i);
      const officeMatch = rowHtml.match(/data-label="Office"[^>]*>([\s\S]*?)<\/td>/i);
      const filingYearMatch = rowHtml.match(/data-label="Filing Year"[^>]*>([\s\S]*?)<\/td>/i);

      const filing = stripTags(filingMatch?.[1] || "");
      if (/PTR/i.test(filing)) {
        const href = memberMatch[1].trim();
        rows.push({
          memberName: stripTags(memberMatch[2]),
          office: stripTags(officeMatch?.[1] || ""),
          filingYear: stripTags(filingYearMatch?.[1] || ""),
          filing,
          filerType,
          reportUrl: new URL(href, `${HOUSE_ORIGIN}/`).href,
        });
      }
    }

    rowMatch = rowRegex.exec(html);
  }

  return rows;
};

const parseUsDateToEpoch = (value = "") => {
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00Z`);
  const epoch = date.getTime();
  return Number.isFinite(epoch) ? epoch : null;
};

const parseReportDateToEpoch = (value = "") => {
  const match = String(value).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = Number(match[3]);
  const epoch = new Date(year, month - 1, day).getTime();
  return Number.isFinite(epoch) ? epoch : null;
};

const isWithinDateRange = (reportDate, startDate, endDate) => {
  if (!startDate && !endDate) return true;
  const reportEpoch = parseReportDateToEpoch(reportDate);
  if (!reportEpoch) return false;

  const startEpoch = startDate ? parseUsDateToEpoch(startDate) : null;
  const endEpoch = endDate ? parseUsDateToEpoch(endDate) : null;

  if (startEpoch && reportEpoch < startEpoch) return false;
  if (endEpoch && reportEpoch > endEpoch) return false;
  return true;
};

const getYearsToSearch = ({ filingYear, startDate, endDate }) => {
  if (filingYear) return [filingYear];
  if (!startDate || !endDate) return [];

  const startYear = Number(startDate.slice(0, 4));
  const endYear = Number(endDate.slice(0, 4));
  if (!Number.isFinite(startYear) || !Number.isFinite(endYear)) return [];

  const low = Math.min(startYear, endYear);
  const high = Math.max(startYear, endYear);
  const years = [];
  for (let year = low; year <= high; year += 1) {
    years.push(String(year));
  }
  return years;
};

const isIdLine = (line) => /^[A-Z]{1,3}\s{2,}/.test(line) && !/^ID\s+Owner\s+Asset/i.test(line);

const isTxLine = (line) => /^(P|S(?:\s+\(partial\))?|E|X|G|R|A|I|T)\s+\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}\/\d{1,2}\/\d{4}\s+/i.test(line);

const shouldIgnoreLine = (line) => (
  /^P\s*T\s*R$/i.test(line)
  || /^Clerk of the House/i.test(line)
  || /^F\s*I$/i.test(line)
  || /^Name:/i.test(line)
  || /^Status:/i.test(line)
  || /^State\/District:/i.test(line)
  || /^ID\s+Owner\s+Asset/i.test(line)
  || /^Date\s+Notification/i.test(line)
  || /^Amount\s+Cap\./i.test(line)
  || /^Gains\s*>/i.test(line)
  || /^Filing ID\s*#/i.test(line)
  || /^--\s*\d+\s+of\s+\d+\s*--$/.test(line)
  || /^\* For the complete list of asset type abbreviations/i.test(line)
  || /^I\s*P\s*O$/i.test(line)
  || /^Yes\s+No$/i.test(line)
  || /^C\s*S$/i.test(line)
  || /^I CERTIFY/i.test(line)
);

const parseTransactionsFromText = (text = "") => {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const signerLine = lines.find((line) => /^Digitally Signed:/i.test(line));
  const filingDateMatch = signerLine?.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
  const filingDate = filingDateMatch ? filingDateMatch[1] : null;

  const nameLine = lines.find((line) => /^Name:/i.test(line));
  const representative = nameLine ? nameLine.replace(/^Name:\s*/i, "").trim() : "Unknown";

  const transactions = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!isIdLine(line)) {
      i += 1;
      continue;
    }

    const idCodeMatch = line.match(/^([A-Z]{1,3})\s{2,}(.*)$/);
    if (!idCodeMatch) {
      i += 1;
      continue;
    }

    const idCode = idCodeMatch[1];
    let assetName = idCodeMatch[2].trim();
    i += 1;

    while (i < lines.length && !isTxLine(lines[i]) && !isIdLine(lines[i]) && !/^D:/i.test(lines[i]) && !/^F\s*S:/i.test(lines[i]) && !shouldIgnoreLine(lines[i])) {
      assetName = `${assetName} ${lines[i]}`.trim();
      i += 1;
    }

    if (i >= lines.length || !isTxLine(lines[i])) {
      continue;
    }

    const txLine = lines[i];
    const txMatch = txLine.match(/^(P|S(?:\s+\(partial\))?|E|X|G|R|A|I|T)\s+(\d{1,2}\/\d{1,2}\/\d{4})\s+(\d{1,2}\/\d{1,2}\/\d{4})\s+(.+)$/i);
    i += 1;

    if (!txMatch) {
      continue;
    }

    let amount = txMatch[4].trim();
    while (i < lines.length && (/^\$[\d,]+/.test(lines[i]) || /^-\s*\$?[\d,]+/.test(lines[i]))) {
      amount = `${amount} ${lines[i]}`.replace(/\s+/g, " ").trim();
      i += 1;
    }

    while (i < lines.length && /^F\s*S:/i.test(lines[i])) {
      i += 1;
    }

    let description = "";
    if (i < lines.length && /^D:/i.test(lines[i])) {
      description = lines[i].replace(/^D:\s*/i, "").trim();
      i += 1;

      while (i < lines.length && !isIdLine(lines[i]) && !isTxLine(lines[i]) && !/^F\s*S:/i.test(lines[i]) && !shouldIgnoreLine(lines[i])) {
        description = `${description} ${lines[i]}`.replace(/\s+/g, " ").trim();
        i += 1;
      }
    }

    const tickerMatch = assetName.match(/\(([A-Z.\-]{1,10})\)\s*\[[A-Z]{2}\]/);

    transactions.push({
      transactionDate: txMatch[2],
      notificationDate: txMatch[3],
      ticker: tickerMatch ? tickerMatch[1] : "N/A",
      assetName,
      type: txMatch[1],
      owner: idCode,
      amount,
      description,
    });
  }

  return {
    representative,
    filingDate,
    transactions,
  };
};

const parseTransactionsFromPdf = async (reportUrl) => {
  const parser = new PDFParse({ url: reportUrl });
  try {
    const parsed = await parser.getText();
    return parseTransactionsFromText(parsed.text || "");
  } finally {
    await parser.destroy();
  }
};

const fetchRowsForYear = async ({
  lastName,
  state,
  district,
  year,
  searchType,
}) => {
  const requests = [];

  if (searchType === "member" || searchType === "all") {
    const memberForm = new URLSearchParams();
    memberForm.set("LastName", lastName || "");
    memberForm.set("FilingYear", year || "");
    memberForm.set("State", state || "");
    memberForm.set("District", district || "");

    requests.push(
      axios.post(HOUSE_MEMBER_SEARCH_URL, memberForm.toString(), {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "stock-app-backend/1.0",
        },
        timeout: 60000,
      }).then((response) => parseResultRows(response.data || "", "member"))
    );
  }

  if (searchType === "candidate" || searchType === "all") {
    const candidateForm = new URLSearchParams();
    candidateForm.set("LastName", lastName || "");
    candidateForm.set("ElectionYear", year || "");
    candidateForm.set("State", state || "");
    candidateForm.set("District", district || "");

    requests.push(
      axios.post(HOUSE_CANDIDATE_SEARCH_URL, candidateForm.toString(), {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "stock-app-backend/1.0",
        },
        timeout: 60000,
      }).then((response) => parseResultRows(response.data || "", "candidate"))
    );
  }

  const results = await Promise.all(requests);
  return results.flat();
};

const searchRepresentativeTransactions = async ({
  lastName,
  filingYear,
  state,
  district,
  startDate,
  endDate,
  searchType,
}) => {
  const years = getYearsToSearch({ filingYear, startDate, endDate });
  if (!years.length) {
    throw new Error("Provide filingYear, or both startDate and endDate");
  }

  const isEmptyQuery = !lastName && !state && !district;
  const effectiveSearchType = isEmptyQuery ? "all" : (searchType || "member");

  const allRows = [];
  for (const year of years) {
    const yearRows = await fetchRowsForYear({
      lastName,
      state,
      district,
      year,
      searchType: effectiveSearchType,
    });
    allRows.push(...yearRows);
  }

  const uniqueRows = [];
  const seen = new Set();
  for (const row of allRows) {
    if (seen.has(row.reportUrl)) continue;
    seen.add(row.reportUrl);
    uniqueRows.push(row);
  }

  const reports = [];
  for (const row of uniqueRows) {
    try {
      const parsed = await parseTransactionsFromPdf(row.reportUrl);
      const reportDate = parsed.filingDate || "Unknown";
      if (!isWithinDateRange(reportDate, startDate, endDate)) {
        continue;
      }

      reports.push({
        representative: parsed.representative || row.memberName,
        office: row.office,
        reportDate,
        reportTitle: `Periodic Transaction Report for ${row.filingYear}`,
        reportUrl: row.reportUrl,
        filingType: row.filing,
        filerType: row.filerType,
        transactions: parsed.transactions,
      });
    } catch (error) {
      reports.push({
        representative: row.memberName,
        office: row.office,
        reportDate: "Unknown",
        reportTitle: `Periodic Transaction Report for ${row.filingYear}`,
        reportUrl: row.reportUrl,
        filingType: row.filing,
        filerType: row.filerType,
        transactions: [],
        parseError: error.message,
      });
    }
  }

  return reports;
};

module.exports = {
  searchRepresentativeTransactions,
};
