FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends libreoffice-writer libreoffice-calc libreoffice-impress qpdf fonts-dejavu-core && rm -rf /var/lib/apt/lists/*
RUN useradd --create-home --shell /usr/sbin/nologin appuser
WORKDIR /app
COPY package*.json ./
COPY client/package.json ./client/package.json
COPY server/package.json ./server/package.json
RUN npm ci --workspace server --omit=dev
COPY server ./server
USER appuser
EXPOSE 8787
CMD ["node","server/src/index.js"]
