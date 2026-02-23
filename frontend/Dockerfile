FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY . .

ARG BACKEND_URL=http://backend:8000
ENV BACKEND_URL=$BACKEND_URL
RUN npm run build

EXPOSE 3000

CMD ["npx", "next", "start"]
