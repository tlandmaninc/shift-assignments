FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY . .

ARG BACKEND_URL=http://backend:8000
ENV BACKEND_URL=$BACKEND_URL
RUN npm run build

RUN adduser --disabled-password --gecos '' --uid 1001 nextjs && \
    chown -R nextjs:nextjs /app
USER nextjs

EXPOSE 3000

CMD ["npx", "next", "start"]
