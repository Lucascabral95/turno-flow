FROM node:20-alpine AS build

WORKDIR /app
COPY package.json ./
COPY prisma ./prisma
RUN npm install
COPY tsconfig.json tsconfig.build.json eslint.config.mjs vitest.config.ts ./
COPY src ./src
RUN npm run build

FROM node:20-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
COPY prisma ./prisma
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
EXPOSE 3001
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
