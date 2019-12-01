FROM node:12-alpine
RUN mkdir -p /app
WORKDIR /app
COPY . /app
RUN yarn install && yarn build
VOLUME /app/config
VOLUME /app/storage
EXPOSE 9000
ENV NODE_ENV=production
CMD ["node", "/app/lib/index.js"]
