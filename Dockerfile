FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --include=dev

COPY . .

# Explicitly put node_modules/.bin on PATH so `npm run` scripts can find
# locally-installed binaries (tsx etc.) regardless of how Alpine's sh
# handles npm's relative-path injection.
ENV PATH="/app/node_modules/.bin:${PATH}"

RUN npm run build

ENV NODE_ENV=production

EXPOSE 5000

COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

CMD ["./docker-entrypoint.sh"]
