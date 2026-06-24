FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

RUN npm run build

EXPOSE 4000

CMD ["node", "dist/app.js"]

# FROM node:20-alpine

# # WORKDIR /app
# WORKDIR /app/server


# COPY package*.json ./
# RUN npm install

# COPY . .
# RUN npm run build

# EXPOSE 4000
# CMD ["npm", "start"]
# # CMD ["node", "dist/app.js"]