const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");

const EFSEARCH_HOME_URL = "https://efdsearch.senate.gov/search/home/";
const EFSEARCH_SEARCH_URL = "https://efdsearch.senate.gov/search/";

const parseUsDateToEpoch = (value) => {
  if (!value || typeof value !== "string") return 0;
  const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return 0;

  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = Number(match[3]);
  const epoch = new Date(year, month - 1, day).getTime();
  return Number.isFinite(epoch) ? epoch : 0;
};

/**
 * Search for senator transactions on the Senate eFD site
 * @param {string} firstName - Senator's first name
 * @param {string} lastName - Senator's last name
 * @param {string} startDate - Start date in YYYY-MM-DD format
 * @param {string} endDate - End date in YYYY-MM-DD format
 * @returns {Promise<Array>} Array of transaction records
 */
const searchSenatorTransactions = async (firstName, lastName, startDate, endDate) => {
  let browser;
  try {
    console.log(`[Senator Service] Searching for ${firstName} ${lastName} from ${startDate} to ${endDate}`);
    
    // Configure Puppeteer for production (Render) and local environments
    const launchOptions = {
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    };

    // On Render, use the system Chrome installation
    if (process.env.NODE_ENV === "production") {
      const fs = require('fs');
      if (fs.existsSync('/usr/bin/chromium')) {
        launchOptions.executablePath = '/usr/bin/chromium';
        console.log('[Senator Service] Using /usr/bin/chromium for Puppeteer');
      } else if (fs.existsSync('/usr/bin/chromium-browser')) {
        launchOptions.executablePath = '/usr/bin/chromium-browser';
        console.log('[Senator Service] Using /usr/bin/chromium-browser for Puppeteer');
      } else if (fs.existsSync('/usr/bin/google-chrome-stable')) {
        launchOptions.executablePath = '/usr/bin/google-chrome-stable';
        console.log('[Senator Service] Using /usr/bin/google-chrome-stable for Puppeteer');
      } else {
        console.log('[Senator Service] No system Chrome found, using Puppeteer default');
      }
    }
    browser = await puppeteer.launch(launchOptions);

    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(60000);
    page.setDefaultTimeout(30000);

    // Navigate to search page directly
    console.log("[Senator Service] Navigating to search page...");
    await page.goto(EFSEARCH_SEARCH_URL, { waitUntil: "domcontentloaded" });

    // Take screenshot to see the terms warning
    const initialScreenshot = path.join(__dirname, "../debug_initial.png");
    await page.screenshot({ path: initialScreenshot });
    console.log(`[Senator Service] Initial screenshot saved to ${initialScreenshot}`);

    // Look for the accept terms checkbox and submit button
    console.log("[Senator Service] Looking for terms acceptance...");
    const termsInfo = await page.evaluate(() => {
      // Look for any checkbox
      const checkboxes = Array.from(document.querySelectorAll("input[type='checkbox']"));
      console.log("Found checkboxes:", checkboxes.length);
      
      // Look for buttons with "agree", "accept", "continue", etc.
      const buttons = Array.from(document.querySelectorAll("button"));
      buttons.forEach((btn, idx) => {
        console.log(`Button ${idx}: "${btn.textContent.trim()}" - ${btn.className}`);
      });
      
      return {
        checkboxCount: checkboxes.length,
        buttonCount: buttons.length,
      };
    });
    
    console.log("[Senator Service] Terms page info:", JSON.stringify(termsInfo, null, 2));

    // Try to find and accept the terms checkbox
    const termsAccepted = await page.evaluate(() => {
      const checkboxes = Array.from(document.querySelectorAll("input[type='checkbox']"));
      
      // Try to find the prohibition/agreement checkbox
      const acceptCheckbox = checkboxes[0]; // Usually the first checkbox
      if (acceptCheckbox) {
        console.log("Found checkbox, clicking it...");
        acceptCheckbox.click();
        acceptCheckbox.checked = true;
        // Trigger change event
        acceptCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
      
      return false;
    });

    console.log(`[Senator Service] Terms checkbox accepted: ${termsAccepted}`);

    // Now look for and click the proceed/search button
    const proceedButtonClicked = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll("button"));
      // Look for search, proceed, or continue button
      const proceedButton = buttons.find(btn => {
        const text = btn.textContent.toLowerCase();
        return text.includes("search") || text.includes("proceed") || text.includes("continue");
      });
      
      if (proceedButton) {
        console.log(`Clicking button: "${proceedButton.textContent.trim()}"`);
        proceedButton.click();
        return true;
      }
      
      return false;
    });

    console.log(`[Senator Service] Proceed button clicked: ${proceedButtonClicked}`);
    
    // Wait for page to load after accepting terms
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Take screenshot after accepting terms
    const afterTermsScreenshot = path.join(__dirname, "../debug_after_terms.png");
    await page.screenshot({ path: afterTermsScreenshot });
    console.log(`[Senator Service] Screenshot after terms saved to ${afterTermsScreenshot}`);

    // Get full HTML to understand structure
    const htmlContent = await page.content();
    const htmlPath = path.join(__dirname, "../debug_search_page.html");
    fs.writeFileSync(htmlPath, htmlContent);
    console.log(`[Senator Service] Full HTML saved to ${htmlPath}`);

    // Get the form element specifically
    const formInfo = await page.evaluate(() => {
      const form = document.querySelector("form");
      if (!form) return { error: "No form found" };
      
      return {
        formId: form.id,
        formClass: form.className,
        formMethod: form.method,
        formAction: form.action,
      };
    });
    
    console.log("[Senator Service] Form info:", JSON.stringify(formInfo, null, 2));

    // Get all input fields to understand the form structure
    const inputInfo = await page.evaluate(() => {
      const inputs = document.querySelectorAll("input");
      return Array.from(inputs).map((input, idx) => ({
        index: idx,
        type: input.type,
        name: input.name,
        id: input.id,
        placeholder: input.placeholder,
        value: input.value,
        visible: input.offsetHeight > 0,
      }));
    });
    
    console.log("[Senator Service] Found inputs:", JSON.stringify(inputInfo, null, 2));

    // Get all buttons to find the search button
    const buttonInfo = await page.evaluate(() => {
      const buttons = document.querySelectorAll("button");
      return Array.from(buttons).map((btn, idx) => ({
        index: idx,
        text: btn.textContent.trim(),
        type: btn.type,
        id: btn.id,
        class: btn.className,
        visible: btn.offsetHeight > 0,
      }));
    });
    
    console.log("[Senator Service] Found buttons:", JSON.stringify(buttonInfo, null, 2));

    // Try to fill the form with the inputs we found
    const firstNameIdx = inputInfo.findIndex(input => 
      input.placeholder.toLowerCase().includes('first') || 
      input.id.toLowerCase().includes('first') ||
      input.name.toLowerCase().includes('first')
    );
    
    const lastNameIdx = inputInfo.findIndex(input => 
      input.placeholder.toLowerCase().includes('last') || 
      input.id.toLowerCase().includes('last') ||
      input.name.toLowerCase().includes('last')
    );

    console.log(`[Senator Service] First name input index: ${firstNameIdx}, Last name input index: ${lastNameIdx}`);

    // Only fill names if provided
    if (firstName && firstNameIdx >= 0) {
      await page.evaluate((idx, value) => {
        const inputs = document.querySelectorAll("input");
        inputs[idx].value = value;
        inputs[idx].dispatchEvent(new Event('input', { bubbles: true }));
        inputs[idx].dispatchEvent(new Event('change', { bubbles: true }));
      }, firstNameIdx, firstName);
      console.log(`[Senator Service] Set first name input (index ${firstNameIdx}) to: ${firstName}`);
    } else if (!firstName) {
      console.log("[Senator Service] No first name provided, searching all senators");
    }

    if (lastName && lastNameIdx >= 0) {
      await page.evaluate((idx, value) => {
        const inputs = document.querySelectorAll("input");
        inputs[idx].value = value;
        inputs[idx].dispatchEvent(new Event('input', { bubbles: true }));
        inputs[idx].dispatchEvent(new Event('change', { bubbles: true }));
      }, lastNameIdx, lastName);
      console.log(`[Senator Service] Set last name input (index ${lastNameIdx}) to: ${lastName}`);
    } else if (!lastName) {
      console.log("[Senator Service] No last name provided, searching all senators");
    }

    // Find and fill date fields
    console.log(`[Senator Service] Setting date range: ${startDate} to ${endDate}`);
    
    // Convert dates to MM/DD/YYYY format for the form
    const [startYear, startMonth, startDay] = startDate.split('-');
    const [endYear, endMonth, endDay] = endDate.split('-');
    const startDateFormatted = `${startMonth}/${startDay}/${startYear}`;
    const endDateFormatted = `${endMonth}/${endDay}/${endYear}`;
    
    await page.evaluate((startDateStr, endDateStr) => {
      const inputs = document.querySelectorAll("input");
      
      // Find date inputs by name
      const startDateInput = Array.from(inputs).find(input => 
        input.name === 'submitted_start_date' || input.id === 'fromDate'
      );
      const endDateInput = Array.from(inputs).find(input => 
        input.name === 'submitted_end_date' || input.id === 'toDate'
      );
      
      if (startDateInput) {
        startDateInput.value = startDateStr;
        startDateInput.dispatchEvent(new Event('input', { bubbles: true }));
        startDateInput.dispatchEvent(new Event('change', { bubbles: true }));
        console.log(`Set start date to: ${startDateStr}`);
      }
      
      if (endDateInput) {
        endDateInput.value = endDateStr;
        endDateInput.dispatchEvent(new Event('input', { bubbles: true }));
        endDateInput.dispatchEvent(new Event('change', { bubbles: true }));
        console.log(`Set end date to: ${endDateStr}`);
      }
    }, startDateFormatted, endDateFormatted);

    console.log(`[Senator Service] Date range set to: ${startDateFormatted} to ${endDateFormatted}`);

    // Submit the form directly using form.submit() method
    console.log("[Senator Service] Submitting search form...");
    
    const formSubmitted = await page.evaluate(() => {
      const form = document.querySelector("form#searchForm");
      if (form) {
        console.log("Found searchForm, calling submit()...");
        form.submit();
        return true;
      }
      console.log("Could not find form#searchForm");
      return false;
    });

    if (formSubmitted) {
      console.log("[Senator Service] Form submitted via form.submit(), waiting for results...");
      // Wait for navigation to complete
      try {
        await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 10000 });
      } catch (e) {
        console.log("[Senator Service] Navigation timeout or error (may be OK if AJAX), waiting anyway...");
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    } else {
      console.warn("[Senator Service] Could not find search form to submit");
    }

    // Take another screenshot to see results
    const resultsScreenshotPath = path.join(__dirname, "../debug_search_results.png");
    await page.screenshot({ path: resultsScreenshotPath });
    console.log(`[Senator Service] Results screenshot saved to ${resultsScreenshotPath}`);

    // Match manual workflow: set DataTables page length to 100 before pagination.
    await page.evaluate(() => {
      if (typeof window.$ === "function" && window.$.fn && window.$.fn.dataTable) {
        const table = window.$("#filedReports").DataTable();
        table.page.len(100).draw("page");
      }
    });

    try {
      await page.waitForFunction(() => {
        if (typeof window.$ === "function" && window.$.fn && window.$.fn.dataTable) {
          const table = window.$("#filedReports").DataTable();
          const info = table.page.info();
          const processingNode = document.querySelector("#filedReports_processing");
          const processingVisible = Boolean(
            processingNode && processingNode.style && processingNode.style.display !== "none"
          );
          return info && info.length === 100 && !processingVisible;
        }
        return true;
      }, { timeout: 15000 });
    } catch (_error) {
      console.warn("[Senator Service] Unable to confirm page length=100; continuing with current DataTables length");
    }

    // Extract report links from all paginated DataTables result pages.
    const readCurrentPageReportLinks = async () => page.evaluate(() => {
      const links = [];
      const rows = document.querySelectorAll("#filedReports tbody tr");

      rows.forEach((row) => {
        const cells = row.querySelectorAll("td");
        const reportLink = row.querySelector("a");

        if (reportLink && cells.length > 0) {
          links.push({
            firstName: cells[0]?.textContent.trim() || "",
            lastName: cells[1]?.textContent.trim() || "",
            filer: cells[2]?.textContent.trim() || "",
            reportTitle: cells[3]?.textContent.trim() || "",
            reportDate: cells[4]?.textContent.trim() || "",
            reportUrl: reportLink.href,
          });
        }
      });

      return links;
    });

    const reportLinks = [];
    const seenReportUrls = new Set();
    let pageCounter = 0;

    // Wait for DataTables to render first page after form submit.
    try {
      await page.waitForFunction(
        () => document.querySelectorAll("#filedReports tbody tr").length > 0,
        { timeout: 20000 }
      );
    } catch (_error) {
      // If no rows, continue and let the normal flow return an empty result set.
    }

    while (true) {
      pageCounter += 1;

      const pageInfo = await page.evaluate(() => {
        if (typeof window.$ === "function" && window.$.fn && window.$.fn.dataTable) {
          const table = window.$("#filedReports").DataTable();
          const info = table.page.info();
          return {
            page: info?.page ?? 0,
            pages: info?.pages ?? 1,
            recordsDisplay: info?.recordsDisplay ?? 0,
          };
        }

        return {
          page: 0,
          pages: 1,
          recordsDisplay: document.querySelectorAll("#filedReports tbody tr").length,
        };
      });

      const pageLinks = await readCurrentPageReportLinks();
      console.log(
        `[Senator Service] Reading results page ${pageInfo.page + 1}/${pageInfo.pages}: ${pageLinks.length} row(s), ${pageInfo.recordsDisplay} total filtered row(s)`
      );
      const currentPageSignature = pageLinks.map((link) => link.reportUrl).join("|");

      pageLinks.forEach((link) => {
        if (!seenReportUrls.has(link.reportUrl)) {
          seenReportUrls.add(link.reportUrl);
          reportLinks.push(link);
        }
      });

      const isLastPage = pageInfo.pages <= 1 || pageInfo.page >= pageInfo.pages - 1;
      if (isLastPage) {
        break;
      }

      const previousPageIndex = pageInfo.page;
      const previousFirstUrl = pageLinks[0]?.reportUrl || null;

      await page.evaluate(() => {
        if (typeof window.$ === "function" && window.$.fn && window.$.fn.dataTable) {
          window.$("#filedReports").DataTable().page("next").draw("page");
          return;
        }

        const nextAnchor = document.querySelector("#filedReports_next a");
        if (nextAnchor) {
          nextAnchor.click();
        }
      });

      try {
        await page.waitForFunction(
          (expectedNextIndex, previousSignature, previousFirstRowUrl) => {
            if (typeof window.$ === "function" && window.$.fn && window.$.fn.dataTable) {
              const info = window.$("#filedReports").DataTable().page.info();
              const processingNode = document.querySelector("#filedReports_processing");
              const processingVisible = Boolean(
                processingNode && processingNode.style && processingNode.style.display !== "none"
              );

              const rowLinks = Array.from(document.querySelectorAll("#filedReports tbody tr a")).map((node) => node.href || "");
              const signature = rowLinks.join("|");
              const firstRowUrl = rowLinks[0] || null;

              if (!info || info.page < expectedNextIndex) {
                return false;
              }

              if (processingVisible) {
                return false;
              }

              if (!signature) {
                return true;
              }

              return signature !== previousSignature || firstRowUrl !== previousFirstRowUrl;
            }
            return true;
          },
          { timeout: 20000 },
          previousPageIndex + 1,
          currentPageSignature,
          previousFirstUrl
        );
      } catch (_error) {
        console.warn("[Senator Service] Timed out waiting for DataTables to advance to next page");
        break;
      }

      // Safety guard in case pagination controls change unexpectedly.
      if (pageCounter >= 200) {
        console.warn("[Senator Service] Pagination safety limit reached at 200 pages");
        break;
      }
    }

    console.log(`[Senator Service] Found ${reportLinks.length} reports to process across ${pageCounter} page(s)`);

    // Visit each report and extract transactions
    const allTransactions = [];
    
    for (let i = 0; i < reportLinks.length; i++) {
      const report = reportLinks[i];
      console.log(`[Senator Service] Processing report ${i + 1}/${reportLinks.length}: ${report.reportTitle}`);
      
      try {
        await page.goto(report.reportUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for page to render
        
        // Extract transactions from this report
        const transactions = await page.evaluate(() => {
          const txns = [];
          const table = document.querySelector("table");
          
          if (table) {
            const rows = table.querySelectorAll("tbody tr");
            rows.forEach((row) => {
              const cells = row.querySelectorAll("td");
              if (cells.length >= 8) {
                txns.push({
                  transactionNumber: cells[0]?.textContent.trim() || "",
                  transactionDate: cells[1]?.textContent.trim() || "",
                  owner: cells[2]?.textContent.trim() || "",
                  ticker: cells[3]?.textContent.trim() || "",
                  assetName: cells[4]?.textContent.trim() || "",
                  assetType: cells[5]?.textContent.trim() || "",
                  transactionType: cells[6]?.textContent.trim() || "",
                  amount: cells[7]?.textContent.trim() || "",
                  comment: cells[8]?.textContent.trim() || "",
                });
              }
            });
          }
          
          return txns;
        });

        // Add report metadata to transactions
        transactions.forEach(txn => {
          allTransactions.push({
            ...txn,
            reportTitle: report.reportTitle,
            reportDate: report.reportDate,
            reportUrl: report.reportUrl,
            senator: report.filer,
          });
        });

        console.log(`[Senator Service]   Extracted ${transactions.length} transactions from this report`);
      } catch (error) {
        console.warn(`[Senator Service]   Error processing report: ${error.message}`);
        // Continue with next report
      }
    }

    console.log(`[Senator Service] Total transactions extracted: ${allTransactions.length}`);
    
    // Group transactions by report
    const reportMap = new Map();
    
    allTransactions.forEach(txn => {
      const reportKey = txn.reportUrl;
      if (!reportMap.has(reportKey)) {
        reportMap.set(reportKey, {
          reportTitle: txn.reportTitle,
          reportDate: txn.reportDate,
          reportUrl: txn.reportUrl,
          senator: txn.senator,
          transactions: [],
        });
      }
      
      // Parse the transaction date
      const [month, day, year] = txn.transactionDate.split('/');
      const formattedDate = `${year}-${month}-${day}`;
      
      reportMap.get(reportKey).transactions.push({
        date: formattedDate,
        transactionDate: txn.transactionDate,
        owner: txn.owner,
        ticker: txn.ticker,
        assetName: txn.assetName,
        assetType: txn.assetType,
        type: txn.transactionType,
        description: `${txn.assetName} (${txn.ticker}) - ${txn.owner}`,
        amount: txn.amount,
        comment: txn.comment,
      });
    });

    // Convert map to array and sort by report date descending
    const groupedReports = Array.from(reportMap.values()).sort((a, b) => {
      return parseUsDateToEpoch(b.reportDate) - parseUsDateToEpoch(a.reportDate);
    });

    console.log(`[Senator Service] Grouped into ${groupedReports.length} reports`);
    
    await browser.close();
    return groupedReports;
  } catch (error) {
    console.error("[Senator Service] Error:", error.message);
    if (browser) {
      await browser.close();
    }
    throw new Error(`Failed to search senator transactions: ${error.message}`);
  }
};

module.exports = {
  searchSenatorTransactions,
};
