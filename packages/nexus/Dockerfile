FROM node:20-alpine
WORKDIR /app
COPY package.json .
RUN npm install --production
COPY . .
ENV NODE_NAME=nexus-docker
EXPOSE 3100
CMD ["node", "bin/cli.js", "start"]
