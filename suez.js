const isDev = process.env.DEV === 'true';

const log = (...args) => {
  return console.log(`[${(new Date()).toISOString()}]`, ...args);
}

const sleep = (ms) => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

const getData = async () => {
  const puppeteer = require('puppeteer-extra');
  const StealthPlugin = require('puppeteer-extra-plugin-stealth');

  puppeteer.use(StealthPlugin());

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
    width: 1168,
    height: 687,
  });

  // Load login page
  await page.goto('https://www.toutsurmoneau.fr/mon-compte-en-ligne/je-me-connecte', {
    waitUntil: 'networkidle0',
  });

  // Wait few seconds
  await sleep(2000);

  // Click on cookie banner
  log(`Accepting cookies...`);
  await page.waitForSelector('#CybotCookiebotDialogBodyButtonDecline');
  await page.click('#CybotCookiebotDialogBodyButtonDecline');

  log(`Logging in...`);

  // Get CSRF token
  const csrfToken = await page.evaluate(() => {
    return window.tsme_data.csrfToken;
  });

  // Login params
  const loginBody = new URLSearchParams({
    'tsme_user_login[_username]': process.env.SUEZ_USERNAME,
    'tsme_user_login[_password]': process.env.SUEZ_PASSWORD,
    '_csrf_token': csrfToken,
    'tsme_user_login[_target_path]': '/mon-compte-en-ligne/tableau-de-bord',
  }).toString();

  // Login
  await page.evaluate((loginBody) => {
    return fetch('https://www.toutsurmoneau.fr/mon-compte-en-ligne/je-me-connecte', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: loginBody,
    });
  }, loginBody);

  // Wait for redirection
  await sleep(10000);

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
              chart_labels: stats.map(stat => stat.date.substring(0, 10)), // YYYY-MM-DD
              chart_datasets: [{
                type: 'line',
                label: 'Water consumption',
                data: stats.map(stat => stat.volume * 1000), // convert m3 to L
              }],
            },
          }),
        });
      }

      found = true;
    }
  });

  await page.goto(`https://www.toutsurmoneau.fr/mon-compte-en-ligne/historique-de-consommation-tr`);

  // Click on label "Jours"
  log(`Clicking on Jours...`);
  const labelPeriod = 'div[data-cy="btn-period"] label:first-child';
  await page.waitForSelector(labelPeriod);
  await page.click(labelPeriod);

  await sleep(5000);

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
