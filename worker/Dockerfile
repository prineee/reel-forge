FROM node:20-alpine

# ffmpeg from Alpine includes libass (subtitle rendering) and libx264
RUN apk add --no-cache ffmpeg

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY src/ ./src/

ENV NODE_ENV=production
ENV PORT=3001
# Tell the app to use the system ffmpeg/ffprobe instead of the npm installer binaries
ENV FFMPEG_PATH=/usr/bin/ffmpeg
ENV FFPROBE_PATH=/usr/bin/ffprobe

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s \
  CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["node", "src/index.js"]
