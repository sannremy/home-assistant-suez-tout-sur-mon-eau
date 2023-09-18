const CronJob = require('cron').CronJob;
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

const log = (...args) => {
  return console.log(`[${(new Date()).toISOString()}]`, ...args);
}

const getData = async () => {
  log(`Get data from Suez, start.`);
  log(`Launching puppeteer...`);
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: '/usr/bin/chromium-browser',
    args: [
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

  log(`Get CSRF token`);

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
  log(`Post login request`);
  await page.evaluate((loginBody) => {
    return fetch('https://www.toutsurmoneau.fr/mon-compte-en-ligne/je-me-connecte', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: loginBody,
    }).then(() => {
      window.location.reload();
    });
  }, loginBody);

  await page.waitForNavigation({
    waitUntil: 'networkidle0',
  });

  log(`Get data...`);

  // Get current month and year
  const date = new Date();
  const data = [];

  // Get data for the last 2 months
  // If today is the 1st of the month, it won't have data yet,
  // so we get the data of the previous month
  for (let i = 0; i < 2; i++) {
    // Get data (last 'i' month)
    date.setMonth(date.getMonth() - i);
    const month = date.getMonth() + 1;
    const year = date.getFullYear();

    log(`Get data for ${month}/${year}`);

    await page.goto(`https://www.toutsurmoneau.fr/mon-compte-en-ligne/statJData/${year}/${month}/${process.env.SUEZ_METER_ID}`);
    const monthData = await page.evaluate(() =>  {
      try {
        return JSON.parse(document.querySelector('body').innerText);
      } catch (e) {
        return null;
      }
    });

    // Add month data at the beginning of the array
    if (monthData) {
      data.unshift(monthData);
    }
  }

  await browser.close();

  log(`Format data...`);

  const dataFlatten = data.flat().map((item) => {
    const [
      date,
      value,
      sum,
    ] = item;
    return [
      date,
      value * 1000, // convert m3 to L
      sum * 1000, // convert m3 to L
    ];
  });

  // Date of yesterday as DD/MM/YYYY
  const yesterday = new Date(Date.now() - 864e5);
  const yesterdayString = `${String(yesterday.getDate()).padStart(2, '0')}/${String(yesterday.getMonth() + 1).padStart(2, '0')}/${yesterday.getFullYear()}`;

  // Find yesterday's data
  const yesterdayData = dataFlatten.find((item) => {
    const [
      date,
    ] = item;
    return date === yesterdayString;
  }) || [];

  log(`Send data to Home Assistant...`);

  await fetch('http://supervisor/core/api/states/sensor.suez_water_consumption', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + process.env.SUPERVISOR_TOKEN,
    },
    body: JSON.stringify({
      state: yesterdayData[1],
      attributes: {
        unit_of_measurement: 'L',
        friendly_name: 'Suez - Water consumption',
        icon: 'mdi:water',
        device_class: 'water',
        date: yesterdayData[0],
        meter: yesterdayData[2],
        state_class: 'measurement',
      },
    }),
  });

  log(`Get data from Suez, done.`);
};

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
