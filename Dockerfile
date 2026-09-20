FROM node:20-alpine AS base

# Install FFmpeg and required media libraries and fonts
RUN apk add --no-cache ffmpeg ttf-dejavu ttf-freefont fontconfig

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm install

# Copy application files
COPY . .

# Build application
RUN npm run build

EXPOSE 3000
ENV PORT=3000
ENV NODE_ENV=production

CMD ["npm", "run", "start"]
