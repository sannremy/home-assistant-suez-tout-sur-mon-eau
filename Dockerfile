ARG BUILD_FROM
FROM $BUILD_FROM

WORKDIR /app
COPY . .

# Install latest Chromium package.
RUN apk add -q --no-cache \
  chromium \
  nss \
  freetype \
  harfbuzz \
  ca-certificates \
  ttf-freefont \
  nodejs-current \
  npm

# Tell Puppeteer to skip installing Chrome. We'll be using the installed package.
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Install Node dependencies
RUN npm install

# Copy data for add-on
COPY run.sh /
RUN chmod a+x /run.sh

CMD [ "/run.sh" ]
