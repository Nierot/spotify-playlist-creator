FROM node:12.14.0

ADD . /home/node/app

RUN chown -R node:node /home/node/app

WORKDIR /home/node/app

COPY package*.json ./

USER node

RUN npm install

COPY --chown=node:node . .

EXPOSE 7000

CMD ["node", "app.js"]