FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

# npm ci with NODE_ENV=production (ambient from some build environments) silently
# skips devDependencies even with --include=dev on certain Alpine npm versions.
# Explicitly unset production mode so tsx and other build tools are always installed.
RUN npm_config_production=false npm ci

COPY . .

# Run the build through npm exec rather than a bare shell command.
# npm exec resolves tsx through npm's full package resolution (same mechanism
# as npx), so it works even if node_modules/.bin is affected by the above.
RUN npm exec tsx -- script/build.ts

ENV NODE_ENV=production

EXPOSE 5000

COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

CMD ["./docker-entrypoint.sh"]
