# Central SSO JWT — Central Authorization Service (Entra ID + JWT)
# Multi-stage: build then production run

FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
RUN npm run build

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

# Non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
USER nodejs

EXPOSE 3000

# Provide config via env (PORT, DATABASE_URL, JWT keys, Entra, etc.). Do not bake .env or keys into image.
CMD ["node", "dist/app.js"]
