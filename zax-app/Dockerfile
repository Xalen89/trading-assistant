FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv libglib2.0-0 libgomp1 poppler-utils && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY python/requirements.txt /tmp/requirements.txt
RUN python3 -m venv /opt/stratdesk-python && /opt/stratdesk-python/bin/pip install --no-cache-dir -r /tmp/requirements.txt
COPY package.json pnpm-lock.yaml .npmrc ./
RUN corepack enable && corepack prepare "$(node -p 'require("./package.json").packageManager')" --activate && pnpm install --frozen-lockfile
COPY . .
RUN pnpm build && EXPO_PUBLIC_API_BASE_URL= CI=1 pnpm exec expo export --platform web --output-dir web-dist && node scripts/write-web-release.mjs && mkdir -p /app/.cache/chart-vectors && chown -R node:node /app
ENV NODE_ENV=production PYTHON_EXECUTABLE=/opt/stratdesk-python/bin/python PYTHONUNBUFFERED=1 OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1
USER node
EXPOSE 3000
CMD ["node", "dist/index.js"]
