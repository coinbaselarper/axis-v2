FROM node:20-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    xvfb \
    xdotool \
    xauth \
    ffmpeg \
    dbus-x11 \
    fonts-liberation \
    fonts-dejavu-core \
    libnss3 \
    libxss1 \
    libasound2 \
    ca-certificates \
    procps \
    tini \
  && rm -rf /var/lib/apt/lists/*

ENV CHROME_BIN=/usr/bin/chromium
ENV CHROME_DEVEL_SANDBOX=/usr/lib/chromium/chrome-sandbox

WORKDIR /app

COPY package.json tsconfig.json ./
RUN npm install --omit=dev=false

COPY src ./src
RUN npx tsc -p .

ENV PORT=8080
ENV HOST=0.0.0.0
EXPOSE 8080

ENTRYPOINT ["/usr/bin/tini","--"]
CMD ["node","dist/index.js"]
