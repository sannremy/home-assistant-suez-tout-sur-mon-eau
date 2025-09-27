const isDev = process.env.DEV === 'true';
const email = process.env.SUEZ_USERNAME;
const password = process.env.SUEZ_PASSWORD;

const log = (...args) => {
  return console.log(`[${(new Date()).toISOString()}]`, ...args);
}

const sleep = (ms) => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

const simulateHumanBehavior = async (page) => {
  // Add random mouse movements
  await page.mouse.move(532 * Math.random() + 122, 243 * Math.random() + 123, { steps: 3 });
  await page.mouse.move(345 * Math.random(), 129 * Math.random() + 342, { steps: 10 });

  // Add pauses
  await sleep(
    Math.floor(Math.random() * (3000 - 1000) + 1000)
  );
};

const getData = async () => {
  const puppeteer = require('puppeteer-extra');
  const StealthPlugin = require('puppeteer-extra-plugin-stealth');
  const AdblockerPlugin = require('puppeteer-extra-plugin-adblocker');

  puppeteer.use(StealthPlugin());
  puppeteer.use(AdblockerPlugin({ blockTrackers: true }));

  log(`Get data from Suez, start.`);
  log(`Launching puppeteer...`);

  const browser = await puppeteer.launch({
    headless: isDev ? false : 'new',
    executablePath: isDev ?
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' :
      '/usr/bin/chromium-browser',
    args: isDev ? [] : [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--headless',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--disable-infobars',
      '--window-position=0,0',
      '--ignore-certificate-errors',
      '--ignore-certificate-errors-spki-list',
      '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    ],
  });

  // Open new tab
  const page = await browser.newPage();

  page.on("framenavigated", frame => {
    const url = frame.url(); // the new url
    log('Frame navigated', url);
  });

  await page.setRequestInterception(true);

  page.on('request', (request) => {
    if (request.url().includes('google') || request.url().includes('gstatic')) {
      request.respond({
        status: 401,
      });
    } else {
      request.continue();
    }
  });

  // Set page timeout
  page.setDefaultNavigationTimeout(5 * 60 * 1000); // 5 minutes

  // Set viewport
  await page.setViewport({
    width: 1905,
    height: 1030,
  });

  // Load login page
  await page.goto('https://www.toutsurmoneau.fr/mon-compte-en-ligne/je-me-connecte', {
    waitUntil: 'networkidle0',
  });

  await simulateHumanBehavior(page);

  // Wait until the Cloudflare challenge form is gone
  await page.waitForFunction(() => {
    return document.querySelector('#challenge-form') === null;
  }, { timeout: 30000 });

  await simulateHumanBehavior(page);

  // Click on cookie banner
  log(`Accepting cookies...`);
  await page.waitForSelector('#CybotCookiebotDialogBodyButtonDecline');
  await page.click('#CybotCookiebotDialogBodyButtonDecline');

  // Login steps

  // Click on email
  await page.waitForSelector('#username');
  await page.click('#username');

  // Type email
  await page.keyboard.type(email);

  // Click on password
  await page.waitForSelector('#password');
  await page.click('#password');

  // Type password
  await page.keyboard.type(password);

  await simulateHumanBehavior(page);

  // Press Enter
  await page.keyboard.press('Enter');

  log(`Logging in...`);

  await simulateHumanBehavior(page);

  // Wait for redirection
  await sleep(Math.random() * 1000 + 10000);

  log(`Get data...`);

  let found = false;

  // Check network for XHR requests
  page.on('response', async (response) => {
    if (response.url().includes('telemetry') && response.url().includes('id_PDS') && response.url().includes('mode=daily')) {
      log(`Get data from Suez, response:`, response.url());

      const data = await response.json();
      const stats = data.content.measures;

      // Get last stat
      const lastStat = stats[stats.length - 1];
      const liters = lastStat.volume * 1000; // convert m3 to L

      if (isDev) {
        log(`Last stat:`, lastStat.volume, lastStat.date);
      } else {
        await fetch('http://supervisor/core/api/states/sensor.suez_water_consumption', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + process.env.SUPERVISOR_TOKEN,
          },
          body: JSON.stringify({
            state: liters,
            attributes: {
              unit_of_measurement: 'L',
              friendly_name: 'Suez - Water consumption',
              icon: 'mdi:water',
              device_class: 'water',
              date: lastStat.date,
              meter: liters,
              state_class: 'measurement',
              // Chart.js labels and datasets attributes
              chart_datasets: [{
                type: 'line',
                label: 'Water consumption',
                data: stats.map(stat => {
                  return {
                    x: stat.date,
                    y: stat.volume * 1000, // convert m3 to L
                  };
                }),
              }],
            },
          }),
        });
      }

      found = true;
    }
  });

  await page.goto(`https://www.toutsurmoneau.fr/mon-compte-en-ligne/historique-de-consommation-tr`);

  await simulateHumanBehavior(page);

  // Click on label "Jours"
  log(`Clicking on Jours...`);
  const labelPeriod = 'div[data-cy="btn-period"] label:first-child';
  await page.waitForSelector(labelPeriod);
  await page.click(labelPeriod);

  await sleep(Math.random() * 1000 + 3000);

  // Check if data is found and close browser
  let counter = 0;
  let timer = setInterval(async () => {
    if (found) {
      log(`Get data from Suez, done.`);
      await browser.close();
      clearInterval(timer);
    }

    if (counter > 30) { // 30 seconds before gracefully exit
      log(`Get data from Suez, failed.`);
      await browser.close();
      clearInterval(timer);
    }

    counter++;
  }, 1000);
};

getData();
