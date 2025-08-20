# Spotify Plaque Generator - Container Image
# Multi-stage for smaller final image

FROM node:20-alpine AS deps
WORKDIR /app
COPY backend/package*.json backend/
RUN cd backend && npm install --production

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8080
# Copy installed node_modules
COPY --from=deps /app/backend/node_modules /app/backend/node_modules
# Copy source
COPY backend /app/backend
COPY frontend /app/frontend
# Expose port
EXPOSE 8080
WORKDIR /app/backend
CMD ["node","src/server.js"]
