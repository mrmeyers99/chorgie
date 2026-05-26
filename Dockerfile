FROM node:20-bookworm-slim

WORKDIR /workspace

COPY package*.json ./
COPY api/package*.json ./api/
COPY web/package*.json ./web/

RUN npm ci

COPY . .

EXPOSE 3000 5173

CMD ["npm", "run", "dev", "--workspace", "web", "--", "--host", "0.0.0.0", "--port", "5173"]
