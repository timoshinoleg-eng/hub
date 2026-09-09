FROM node:22.23.0-alpine3.22 AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:22.23.0-alpine3.22 AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=dependencies /app/node_modules ./node_modules
COPY . ./
USER node

FROM nginx:1.28.1-alpine3.21 AS static
COPY deploy/nginx.conf /etc/nginx/nginx.conf
COPY . /usr/share/nginx/html
USER nginx
CMD ["nginx", "-c", "/etc/nginx/nginx.conf", "-g", "daemon off;"]
