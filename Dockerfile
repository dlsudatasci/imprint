# Base image
FROM node:22-alpine

# Set working directory
WORKDIR /app

# Install dependencies
COPY package.json yarn.lock ./
RUN yarn install

# Copy source files
COPY . .

# Expose Next.js default port
EXPOSE 3000

# Run development server with hot reload
CMD ["yarn", "dev"]
