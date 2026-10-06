FROM node:24-alpine AS dependencies
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && corepack prepare pnpm@11.25.0 --activate && pnpm install --frozen-lockfile --prod --ignore-scripts
COPY prisma ./prisma
RUN DATABASE_URL=postgresql://placeholder:placeholder@localhost/placeholder pnpm exec prisma generate
COPY src ./src
RUN mkdir -p /app/uploads && chown -R node:node /app
USER node
EXPOSE 4100
CMD ["node","src/server.js"]
