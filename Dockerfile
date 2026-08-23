FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY src ./src
COPY bin ./bin
COPY public ./public
COPY schema ./schema
ENV HOST=0.0.0.0 PORT=4317 RELAY_DATA_DIR=/data
VOLUME ["/data"]
EXPOSE 4317
CMD ["node", "src/server.mjs"]
