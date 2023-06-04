# SUEZ - Tout sur mon eau Addon for Home Assistant

Get daily water consumption from [Tout sur mon eau](https://www.toutsurmoneau.fr/) to Home Assistant as a state. The update occurs every day at 4am.

### Synopsis

This project has been inspired by [PySuez](https://github.com/ooii/pySuez) and [Suez Water integration](https://www.home-assistant.io/integrations/suez_water/).

### Motivation

The Tout sur mon eau website keeps changing structures and algorithms, which break unofficial libraries to get the data. I reached out to know if there's any plan for an official API, unfortunately they never replied.

## Installation

 - Add the add-ons repository to your Home Assistant: `https://github.com/sannremy/home-assistant-suez-tout-sur-mon-eau`.
 - Install the *SUEZ - Tout sur mon eau* add-on.
 - Configure the add-on with your SUEZ credentials and meter ID.

## Configuration

|Option|Required|Description|
|---------|--------|-----------|
|`username`|Yes|The email address to login on Tout sur mon eau.|
|`password`|Yes|The password to login on Tout sur mon eau.|
|`meter_id`|Yes|The meter ID to monitor. It can be found by going through: *Ma conso*, *Je suis mes consommations*, right-click on *Exporter les données*, Copy Link. The ID is located at the end of the link. It usually contains numbers.|
|`cron`|No|Default is every day at 6am: `0 6 * * *`. If set, it will override the time when the job runs.|

## Contributing

Feel free to contribute by submitting issues and pull requests.
