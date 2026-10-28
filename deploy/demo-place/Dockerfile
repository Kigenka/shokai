# The Shōkai demo place. Build after @kigenka/shokai is published (or copy the package file in and install it first).
FROM node:22-alpine
WORKDIR /app
COPY package.json server.mjs keys.mjs ./
RUN npm install --omit=dev --no-audit --no-fund && mkdir -p /data && chown node /data
USER node
ENV HOST=0.0.0.0 PORT=8080 DATA_DIR=/data TRUST_PROXY=1
EXPOSE 8080
HEALTHCHECK CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
CMD ["node", "server.mjs"]
