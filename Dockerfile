FROM node:22-bookworm

WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci
COPY src ./src
COPY vendor ./vendor
COPY test ./test

CMD ["sh", "-lc", "npm run typecheck && npm test && npm run test:integration"]
