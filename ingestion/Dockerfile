FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
# מעתיק גם את data.js/config.js מרמת הפרויקט מתבצע דרך volume בזמן ריצה
CMD ["node", "seed_from_datajs.mjs"]
