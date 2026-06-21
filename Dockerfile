FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

# Force-install devDependencies regardless of any NODE_ENV inherited
# from the build environment. tsx lives in devDeps and is needed to compile.
RUN npm ci --include=dev

COPY . .

# Invoke tsx by its full path instead of going through `npm run build`.
# `npm run` uses sh's PATH lookup and can miss node_modules/.bin if the
# shell environment has NODE_ENV=production set during the build context.
# This is byte-for-byte identical to what the build script does.
RUN node_modules/.bin/tsx script/build.ts

ENV NODE_ENV=production

EXPOSE 5000

COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

CMD ["./docker-entrypoint.sh"]
