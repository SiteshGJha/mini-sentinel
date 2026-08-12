FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY apps/api/package*.json ./apps/api/
RUN npm ci
COPY . .
RUN npx prisma generate --schema=apps/api/prisma/schema.prisma
RUN npm run api:build

FROM node:18-alpine AS runner
WORKDIR /app

# Install Python3, pip, and build headers for Presidio/spaCy dependencies
RUN apk add --no-cache python3 py3-pip build-base python3-dev
ENV PIP_BREAK_SYSTEM_PACKAGES=1
RUN pip3 install --no-cache-dir presidio-analyzer presidio-anonymizer spacy
RUN python3 -m spacy download en_core_web_sm

# Copy built JS files, database schemas, and Python microservice code
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder /app/apps/api/dist ./dist
COPY pii-service ./pii-service

# Create a unified startup script to run the Python TCP server and NestJS App concurrently
RUN printf "#!/bin/sh\npython3 /app/pii-service/server.py &\nnode /app/dist/src/main.js\n" > /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

ENV PORT=3000
ENV PII_SERVICE_HOST=localhost
ENV PII_SERVICE_PORT=50051

EXPOSE 3000
CMD ["/app/entrypoint.sh"]