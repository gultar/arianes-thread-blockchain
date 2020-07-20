FROM node:14

WORKDIR /home/blockchain

COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 8000