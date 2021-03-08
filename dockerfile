 FROM node:10
 WORKDIR /restmail.net
 COPY . .
 RUN npm install
 USER node
