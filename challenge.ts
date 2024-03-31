// run the commands
//npm install (It removes all the exceptions and errors)
//tsx runner.ts
import * as fs from "fs"; // File system module for handling file operations
import axios from "axios"; // HTTP client for making requests
import { CheerioCrawler } from "crawlee"; // Crawler module for scraping web pages
import * as cheerio from "cheerio"; // HTML parsing library
import { CSV_INPUT_PATH, JSON_OUTPUT_PATH } from "./resources"; // Importing file paths for input and output data
import * as csv from "fast-csv"; // Module for parsing CSV files

// Interfaces
interface Company {
  name: string;
  url: string;
}

interface CompanyData {
  name: string;
  description?: string;
  founded: string;
  teamSize?: number;
  Location?: string;
  founders?: Founder[];
  launchPosts?: LaunchPost[];
  jobCount?: number;
  jobs?: Job[];
}

interface Founder {
  name: string;
  linkedIn?: string;
  Twitter?: string;
}

interface Job {
  role: string;
  location: string;
}

interface LaunchPost {
  title: string;
  url: string;
}

// Main function to process the list of companies
export async function processCompanyList() {
  // Parse the CSV file to get the list of companies
  const companies = await parseCsv(CSV_INPUT_PATH);

  // Scrape data for each company
  const scrapedData = await scrapeCompanyData(companies);

  // Filter out null values from scraped data
  const filteredData = scrapedData.filter((data) => data !== null);

  // Write the filtered data to a JSON file
  await writeJson(JSON_OUTPUT_PATH, filteredData);
  console.log("✅ Done!");
}

// Helper function to parse CSV file and extract company information
async function parseCsv(filePath: string): Promise<Company[]> {
  return new Promise<Company[]>((resolve, reject) => {
    const companies: Company[] = [];
    try {
      // Create a read stream for the CSV file
      const fileStream = fs.createReadStream(filePath);
      const csvStream = csv.parse({ headers: true });
      // Pipe the CSV stream to parse the data
      fileStream
        .pipe(csvStream)
        .on("data", (data: any) => {
          // Extract company name and URL from CSV data
          const company: Company = {
            name: data["Company Name"],
            url: data["YC URL"],
          };
          companies.push(company);
        })
        .on("end", () => {
          console.log("CSV file parsed successfully.");
          resolve(companies);
        })
        .on("error", (error) => {
          console.error(`Error parsing CSV file: ${error}`);
          reject(error);
        });
    } catch (error) {
      console.error(`Error parsing CSV file: ${error}`);
      reject(error);
    }
  });
}

// Helper function to scrape company data from YC profile pages
async function scrapeCompanyData(
  companies: Company[]
): Promise<(CompanyData | null)[]> {
  const scrapedData = await Promise.all(
    companies.map(async (company) => {
      try {
        if (!company || !company.url) {
          console.error("Invalid company object:", company);
          return null;
        }

        const companyData = await scrapeCompanyProfile(company);
        return companyData;
      } catch (error) {
        console.error(`Error scraping ${company.name}'s profile:`, error);
        return null;
      }
    })
  );

  return scrapedData;
}
// Helper function to scrape individual company profile
async function scrapeCompanyProfile(
  company: Company
): Promise<CompanyData | null> {
  try {
    // Fetch the HTML content of the company's profile page
    const response = await axios.get(company.url);
    const html = response.data;
    // Load the HTML content using Cheerio for parsing
    const $ = cheerio.load(html);

    // Extract relevant data using Cheerio selectors
    const name = $("h1").text().trim();

    const description = $("div.prose.max-w-full h3").first().text().trim();

    const foundedElement = $(
      "div.flex.flex-row.justify-between span:contains('Founded:') + span"
    );
    const founded = foundedElement.text().trim();

    const teamSizeElement = $(
      "div.flex.flex-row.justify-between span:contains('Team Size') + span"
    );
    const teamSize = teamSizeElement.text().trim();

    const LocationElement = $(
      "div.flex.flex-row.justify-between span:contains('Location') + span"
    );
    const Location = LocationElement.text().trim();

    const jobCountElement = $("span.ycdc-badge.ml-0.font-bold.no-underline");
    const jobCountText = jobCountElement.text().trim();
    const jobCount = parseInt(jobCountText);

    const founders: Founder[] = [];
    $("div.leading-snug").each((index, element) => {
      const founderName = $(element).find("div.font-bold").text().trim();
      const linkedInElement = $(element).find("a[title='LinkedIn profile']");
      const linkedIn = linkedInElement.attr("href");
      const TwitterElement = $(element).find("a[title='Twitter account']");
      const Twitter = TwitterElement.attr("href");

      founders.push({ name: founderName, linkedIn, Twitter });
    });

    // Extract jobs
    const jobs: Job[] = [];

    $("div.flex.w-full.flex-row.justify-between.py-4").each(
      (index, element) => {
        const roleElement = $(element).find(
          "div.ycdc-with-link-color.pr-4.text-lg.font-bold a"
        );
        const locationElements = $(element).find(
          "div.justify-left.flex.flex-row.gap-x-7 div.list-item.list-square.capitalize"
        );

        // Only proceed if both role and location information are found
        if (roleElement.length > 0 && locationElements.length > 0) {
          const role = roleElement.text().trim();
          const location = $(locationElements[0]).text().trim(); // Extracting the first location element

          jobs.push({ role, location });
        }
      }
    );

    // Extract launch posts
    const launchPosts: LaunchPost[] = [];
    $("div.prose.max-w-full.prose-h2\\:mt-0").each((index, element) => {
      const titleElement = $(element).find(
        "a.ycdc-with-link-color.mb-4.mt-0.text-xl.underline h3"
      );
      const title = titleElement.text().trim();
      const url = titleElement.parent().attr("href");

      if (url) {
        launchPosts.push({ title, url });
      }
    });
    // Construct CompanyData object with extracted data
    const companyData: CompanyData = {
      name,
      description,
      founded,
      teamSize: parseInt(teamSize),
      Location,
      founders,
      launchPosts,
      jobCount,
      jobs,
    };

    return companyData;
  } catch (error) {
    console.error(`Error scraping ${company.name}'s profile: ${error.message}`);
    return null;
  }
}

// Utility function to write JSON data to a file
async function writeJson(filePath: string, data: any) {
  try {
    // Ensure the directory exists, creating it if necessary
    const directory = filePath.split("/").slice(0, -1).join("/");
    if (!fs.existsSync(directory)) {
      fs.mkdirSync(directory, { recursive: true });
    }
    // Write JSON data to file
    await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2));
    console.log(`JSON data written to ${filePath} succesfully.`);
  } catch (error) {
    console.error(`Error writing JSON file: ${error}`);
    throw error;
  }
}
