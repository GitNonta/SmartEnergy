# syntax = docker/dockerfile:1

# Adjust NODE_VERSION as desired
ARG NODE_VERSION=22.21.1
FROM node:${NODE_VERSION}-slim AS base

LABEL fly_launch_runtime="Node.js"

# Node.js app lives here
WORKDIR /app

# Set production environment
ENV NODE_ENV="production"


# Throw-away build stage to reduce size of final image
FROM base AS build

# Install packages needed to build node modules
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y build-essential node-gyp pkg-config python-is-python3

# Copy package files for dependency installation caching
COPY package.json package-lock.json ./
COPY backend/package.json backend/package-lock.json ./backend/
COPY frontend/package.json frontend/package-lock.json ./frontend/

# Install dependencies
# 1. Install root dependencies (concurrently, etc.)
RUN npm ci --include=dev

# 2. Install backend dependencies
RUN cd backend && npm ci --include=dev

# 3. Install frontend dependencies (needed for build)
RUN cd frontend && npm ci --include=dev

# Copy application code
COPY . .

# Build frontend application
# Explicitly run the frontend build command
RUN cd frontend && npm run build

# Remove development dependencies to keep image small
# Prune root
RUN npm prune --omit=dev
# Prune backend
RUN cd backend && npm prune --omit=dev
# Prune frontend (not strictly necessary as we serve static files, but good practice)
RUN cd frontend && npm prune --omit=dev


# Final stage for app image
FROM base

# Copy built application and dependencies
COPY --from=build /app /app

# Start the server by default, this can be overwritten at runtime
EXPOSE 3000
EXPOSE 3001

# Start both backend and frontend (using the start script in root package.json)
CMD [ "npm", "run", "start" ]
