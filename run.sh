#!/usr/bin/with-contenv bashio

export SUEZ_USERNAME="$(bashio::config 'username')"
export SUEZ_PASSWORD="$(bashio::config 'password')"
export SUEZ_METER_ID="$(bashio::config 'meter_id')"

# Set up cron job to run script every day at 4am
crontab -l > suez_cron
echo "00 04 * * * node suez.js" >> suez_cron
crontab suez_cron
rm suez_cron

# Run script once
node suez.js
