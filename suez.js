const CronJob = require('cron').CronJob;
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

const isDev = process.env.DEV === 'true';

puppeteer.use(StealthPlugin());

const log = (...args) => {
  return console.log(`[${(new Date()).toISOString()}]`, ...args);
}

const sleep = (ms) => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

const getData = async () => {
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
    ],
  });

  // Open new tab
  const page = await browser.newPage();

  // Set page timeout
  page.setDefaultNavigationTimeout(5 * 60 * 1000); // 5 minutes

  // Set viewport
  await page.setViewport({
    width: 1168,
    height: 687,
  });

  log(`Logging in...`);

  // Load login page
  await page.goto('https://www.toutsurmoneau.fr/mon-compte-en-ligne/je-me-connecte', {
    waitUntil: 'networkidle0',
  });

  // Click on cookie banner
  await page.waitForSelector('#CybotCookiebotDialogBodyButtonDecline');
  await page.click('#CybotCookiebotDialogBodyButtonDecline');

  // Wait few seconds
  await sleep(2000);

  // Type username in #username
  await page.click('label[for="username"]');
  await page.keyboard.type(process.env.SUEZ_USERNAME);

  // Type password in #password
  await page.click('label[for="password"]');
  await page.keyboard.type(process.env.SUEZ_PASSWORD);

  // Press enter
  await page.keyboard.press('Enter');

  // Wait for redirection
  await page.waitForNavigation({
    waitUntil: 'networkidle0',
  });

  log(`Get data...`);

  await page.goto(`https://www.toutsurmoneau.fr/mon-compte-en-ligne/historique-de-consommation-tr`);

  // Click on label "Litres"
  await page.waitForSelector('div[data-cy="btn-period"]');
  await page.click('div[data-cy="btn-period"] label:first-child');

  // Click on label "Jours"
  await page.waitForSelector('div[data-cy="btn-unit"]');
  await page.click('div[data-cy="btn-unit"] label:first-child');

  let found = false;

  // Check network for XHR requests
  page.on('response', async (response) => {
    if (response.url().includes('telemetry') && response.url().includes('id_PDS') && response.url().includes('mode=daily')) {
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
            },
          }),
        });
      }

      found = true;
    }
  });

  // Check if data is found and close browser
  let counter = 0;
  let timer = setInterval(async () => {
    if (found) {
      log(`Get data from Suez, done.`);
      await browser.close();
      clearInterval(timer);
    }

    if (counter > 30) { // 30 seconds
      log(`Get data from Suez, failed.`);
      await browser.close();
      clearInterval(timer);
    }

    counter++;
  }, 1000);
};

if (isDev) {
  getData();
} else {
  const job = new CronJob(
    `0 ${process.env.SUEZ_CRON}`,
    function () { // onTick
      getData();
    },
    null,
    true, // Start the job right now
    'Europe/Paris', // Timezone
    null, // Context
    true // Run the job
  );
}
