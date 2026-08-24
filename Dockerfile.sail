FROM node:22-bookworm-slim
WORKDIR /opt/relay
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm install --global opencode-ai@1.18.21
COPY src ./src
COPY bin ./bin
COPY public ./public
COPY scripts ./scripts
COPY schema ./schema
COPY README.md ARCHITECTURE.md PROTOCOL.md COST_EFFICACY.md ./
ENV HOST=0.0.0.0 PORT=4319 RELAY_DATA_DIR=/data RELAY_POD_DIR=/data/pods RELAY_WORK_POD_PROVIDER=local
EXPOSE 4319
