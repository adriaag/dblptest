
const fs = require('fs');
const fsprom = require('node:fs/promises');
const { chromium } = require("playwright");
const { XMLValidator, XMLParser } = require("fast-xml-parser");
const path = require("node:path");

const PROFILE_DIR = path.resolve("./dblp-browser-profile");
const OUTPUT_DIR = path.resolve("./dblp-data");


const configPath = path.join(__dirname,'config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// Extract dictionaries from config
const personDictionary = {};
const yearDictionary = {};
const nameVariationsMap = {};

const sleep = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

Object.entries(config.authors).forEach(([slug, author]) => {
    if (author.dblpId) {
        personDictionary[slug] = author.dblpId;
        yearDictionary[slug] = author.minYear;
        nameVariationsMap[slug] = author.nameVariations;
    }
});

const urls = []

for (const [personKey, personID] of Object.entries(personDictionary)) {
        console.log(`\n📚 Processing ${personKey} (${personID})...`);
        const url = `https://dblp.org/pid/${personID}.xml`;
        urls.push(url)
}


async function fetchDblpXml(page, url, outputFile) {
  console.log(`Fetching ${url}`);

  try {
    // Listen before navigation so the response isn't missed.
    const responsePromise = page.waitForResponse(
      (response) => {
        const responseUrl = response.url().split("?")[0];
        const contentType =
          response.headers()["content-type"] || "";

        return (
          responseUrl === url.split("?")[0] &&
          response.status() === 200 &&
          contentType.toLowerCase().includes("xml")
        );
      },
      { timeout: 120_000 }
    );

    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });

    const response = await responsePromise;
    const data = await response.body();

    // Validate XML syntax.
    const xml = data.toString("utf8");
    const validation = XMLValidator.validate(xml);

    if (validation !== true) {
      console.error("Invalid XML:", validation.err);
      return false;
    }

    // Validate the document root.
    const parser = new XMLParser({
      ignoreAttributes: false,
      preserveOrder: false,
    });

    const parsed = parser.parse(xml, true);
    const rootName = Object.keys(parsed).find(
    (key) => key !== "?xml"
    );
    if (!["dblpperson", "dblp"].includes(rootName)) {
      console.error(`Unexpected XML root: ${rootName}`);
      return false;
    }

    // Save the original bytes, not reconstructed XML.
    await fsprom.writeFile(outputFile, data);

    console.log(`Validated XML root: <${rootName}>`);
    console.log(`Saved ${data.length} bytes to ${outputFile}`);

    return true;
  } catch (error) {
    console.error("Failed to retrieve XML:", error.message);
    console.error("Current URL:", page.url());
    console.error("Page title:", await page.title().catch(() => ""));
    return false;
  }
}

async function main() {
  await fsprom.mkdir(OUTPUT_DIR, { recursive: true });

  // Reuses cookies and browser profile data across runs.
  const context = await chromium.launchPersistentContext(
    PROFILE_DIR,
    {
      headless: false,
    }
  );

  try {
    const page = context.pages()[0] || await context.newPage();

    for (const url of urls) {
      const personId = url
        .split("/")
        .pop()
        .replace(/\.xml(?:\?.*)?$/, "");

      const outputFile = path.join(
        OUTPUT_DIR,
        `${personId}.xml`
      );

      await fetchDblpXml(page, url, outputFile);
        console.log("Waiting 1 seconds before the next request...");
        await sleep(1000);
    }
  } finally {
    await context.close();
  }
}

main().catch(console.error);
