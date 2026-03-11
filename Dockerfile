# Dockerfile for Arduino Remote IDE

# Use Node.js as base
FROM node:20-slim

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    tar \
    && rm -rf /var/lib/apt/lists/*

# Install arduino-cli
RUN curl -fsSL https://raw.githubusercontent.com/arduino/arduino-cli/master/install.sh | BINDIR=/usr/local/bin sh

# Setup Arduino CLI and install AVR core
# We do this during build so the image is ready to compile out-of-the-box
RUN arduino-cli core update-index && \
    arduino-cli core install arduino:avr

# Set working directory
WORKDIR /app

# Copy application files
# Copy only necessary folders to keep image small
COPY server ./server
COPY client ./client

# Install server dependencies
WORKDIR /app/server
RUN npm install --omit=dev

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Expose the application port
EXPOSE 3000

# Command to run the application
CMD ["node", "server.js"]
