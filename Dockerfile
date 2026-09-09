FROM node:22-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=dependencies /app/node_modules ./node_modules
COPY . ./
USER node

FROM nginx:alpine AS static
COPY deploy/nginx.conf /etc/nginx/nginx.conf
COPY . /usr/share/nginx/html
USER nginx
CMD ["nginx", "-c", "/etc/nginx/nginx.conf", "-g", "daemon off;"]
