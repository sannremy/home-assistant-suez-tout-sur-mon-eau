#!/usr/bin/with-contenv bashio

export SUEZ_USERNAME="$(bashio::config 'username')"
export SUEZ_PASSWORD="$(bashio::config 'password')"
export SUEZ_METER_ID="$(bashio::config 'meter_id')"
export SUEZ_CRON="$(bashio::config 'cron')"

# Run script once
node suez.js
