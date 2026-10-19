FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json drizzle.config.ts ./
COPY src ./src
COPY drizzle ./drizzle
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "src/server.ts"]
