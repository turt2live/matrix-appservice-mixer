FROM node:12-alpine
RUN mkdir -p /app
WORKDIR /app
COPY . /app

# Update yarn
RUN npm install -g yarn@latest

# We have to clone and build the client-node library to fix a TS problem
ENV NODE_ENV=development
RUN apk add git
RUN mkdir -p /client-node && cd /client-node && git clone https://github.com/mixer/client-node.git
WORKDIR /client-node/client-node
RUN git fetch origin pull/108/head:travis-fix-typescript
RUN git checkout travis-fix-typescript && npm install && npm run build && yarn link
WORKDIR /app
RUN yarn link @mixer/client-node

RUN yarn install && yarn build
VOLUME /app/config
VOLUME /app/storage
EXPOSE 9000
ENV NODE_ENV=production
CMD ["node", "/app/lib/index.js"]
