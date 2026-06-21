FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

# package-lock.json exported from Replit contains resolved URLs pointing at
# Replit's internal package proxy (http://package-firewall.replit.local/npm/...).
# Those URLs are only reachable inside Replit infrastructure. Outside Replit they
# produce ENOTFOUND, causing npm ci to hang on repeated retries and ultimately
# fail to install anything. Rewrite to the public registry before running npm ci.
RUN sed -i 's|http://package-firewall.replit.local/npm|https://registry.npmjs.org|g' \
        package-lock.json

RUN npm_config_production=false npm ci

COPY . .

RUN npm exec tsx -- script/build.ts

ENV NODE_ENV=production

EXPOSE 5000

COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

CMD ["./docker-entrypoint.sh"]
