# syntax=docker/dockerfile:1

FROM node:22-bookworm AS build
WORKDIR /frontend

COPY package.json package-lock.json ./
RUN npm ci

COPY . ./
RUN npm run build

FROM nginx:1.27-alpine
COPY .docker/nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /frontend/dist /usr/share/nginx/html
EXPOSE 80
