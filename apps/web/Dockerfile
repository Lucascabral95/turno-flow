FROM node:20-alpine AS deps

WORKDIR /app
COPY package.json ./
RUN npm install

FROM deps AS build

WORKDIR /app
ARG NEXT_PUBLIC_API_URL
ARG SERVER_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV SERVER_API_URL=$SERVER_API_URL
COPY . .
RUN npm run build

FROM deps AS production-deps

WORKDIR /app
RUN npm prune --omit=dev

FROM node:20-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
COPY --from=production-deps /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/next.config.ts ./next.config.ts
EXPOSE 3000
CMD ["npm", "run", "start"]
