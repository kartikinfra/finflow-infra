FROM node:20-alpine

RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./
RUN wget "https://dl.k8s.io/release/v1.35.2/bin/linux/arm64/kubectl" && \
    chmod +x kubectl && \
    mv kubectl /usr/local/bin/
RUN npm install --production --build-from-source


COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
