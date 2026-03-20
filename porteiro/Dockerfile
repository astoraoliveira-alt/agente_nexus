# Use the official Node.js image with Alpine for a lightweight build
FROM node:23-slim

# Create and define the application directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm install

# Copy the rest of the app's source code
COPY . .

# Environment variables will be loaded from the .env file in the VPS
# via Docker Compose. No need to COPY .env into the image.

# Command to run the app
CMD ["npx", "tsx", "src/index.ts"]
