FROM node:24-alpine AS build
WORKDIR /app
COPY docker/environment-proxy-ca.crt /usr/local/share/ca-certificates/environment-proxy-ca.crt
RUN cat /usr/local/share/ca-certificates/environment-proxy-ca.crt >> /etc/ssl/certs/ca-certificates.crt
ENV NODE_EXTRA_CA_CERTS=/usr/local/share/ca-certificates/environment-proxy-ca.crt
COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci
COPY apps/web apps/web
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build -w @nexoclinic/web
FROM nginx:1.27-alpine
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
