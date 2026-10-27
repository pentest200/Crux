FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY client/package.json ./client/package.json
COPY server/package.json ./server/package.json
RUN npm ci --workspace client --include=dev
COPY client ./client
RUN npm run build --workspace client
FROM nginx:1.27-alpine
ENV NGINX_ENVSUBST_TEMPLATE_VARS=$API_HOSTPORT
COPY --from=build /app/dist-mern /usr/share/nginx/html
COPY client/nginx.conf /etc/nginx/templates/default.conf.template
EXPOSE 80
