FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY . .

EXPOSE 3000

# Production: build + start (used by docker-compose.prod.yaml)
# Dev compose overrides CMD to skip the build step
CMD ["sh", "-c", "npm run build && npx next start"]
