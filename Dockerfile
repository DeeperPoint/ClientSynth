# ClientSynth — full application image (Next.js app + Python parsing sidecar)
#
# The app spawns python3 at runtime for PDF/DOCX parsing and generation
# (lib/pdf_parser.py, lib/pdf_service.py, lib/docx_parser.py), so the image
# carries both the Node runtime and the Python dependencies from requirements.txt.
#
# Build:  docker compose build app     (or: docker build -t clientsynth .)
# Run:    docker compose up            (app on http://localhost:3000)

FROM node:20-bookworm-slim

# Python sidecar for PDF/DOCX parsing + generation
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-pip \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt ./
RUN pip3 install --no-cache-dir --break-system-packages -r requirements.txt

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Placeholders for env vars that route modules evaluate at import time during
# `next build` page-data collection (e.g. /api/pdf/templates constructs an
# AIGenerator, which throws without OPENROUTER_API_KEY). Real values are
# supplied at runtime via docker-compose and override these.
ENV NEXT_TELEMETRY_DISABLED=1
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" \
    OPENROUTER_API_KEY="build-placeholder" \
    JWT_SECRET="build-placeholder" \
    npm run build

EXPOSE 3000
ENV NODE_ENV=production
CMD ["npm", "run", "start"]
