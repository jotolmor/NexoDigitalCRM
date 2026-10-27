FROM node:24-alpine AS build
WORKDIR /app
COPY docker/environment-proxy-ca.crt /usr/local/share/ca-certificates/environment-proxy-ca.crt
RUN cat /usr/local/share/ca-certificates/environment-proxy-ca.crt >> /etc/ssl/certs/ca-certificates.crt
ENV NODE_EXTRA_CA_CERTS=/usr/local/share/ca-certificates/environment-proxy-ca.crt
COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci
COPY apps/api apps/api
RUN npm run prisma:generate -w @nexoclinic/api && npm run build -w @nexoclinic/api
FROM node:24-alpine
WORKDIR /app
COPY docker/environment-proxy-ca.crt /usr/local/share/ca-certificates/environment-proxy-ca.crt
RUN cat /usr/local/share/ca-certificates/environment-proxy-ca.crt >> /etc/ssl/certs/ca-certificates.crt
ENV NODE_EXTRA_CA_CERTS=/usr/local/share/ca-certificates/environment-proxy-ca.crt
COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --omit=dev
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/api/prisma apps/api/prisma
COPY --from=build /app/node_modules/.prisma/client node_modules/.prisma/client
COPY --from=build /app/node_modules/@prisma/client node_modules/@prisma/client
WORKDIR /app/apps/api
EXPOSE 3000
CMD ["node", "dist/main.js"]
