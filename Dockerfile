# ===================================================
# STAGE 1: Build Angular Frontend
# ===================================================
FROM node:20 AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ .
RUN npm run build -- --configuration=production

# ===================================================
# STAGE 2: Compile Node.js TypeScript Backend
# ===================================================
FROM node:20 AS backend-compiler
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm install 
COPY backend/ .
# Compiles your TS code (Ensure your package.json script runs "tsc")
RUN npm run build

# ===================================================
# STAGE 3: Final Production Bundle
# ===================================================
FROM node:20-slim
WORKDIR /app

# Copy the database directory
# COPY database/ .

# Install ONLY production dependencies for Node.js
COPY backend/package*.json ./
#RUN npm install --only=production
RUN npm install --omit=dev

# Copy compiled JavaScript files from Stage 2 into the production /dist directory
COPY --from=backend-compiler /app/backend/dist ./dist

# Copy the built Angular static files into the production /public directory
# Maps directly to your output path: dist/client-creation-angular
COPY --from=frontend-builder /app/frontend/dist/client-creation-angular ./public

EXPOSE 8080

# Run the compiled Node.js entry point
CMD ["node", "dist/server.js"]
