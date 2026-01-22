# Use official Node.js image
FROM node:20-slim

# Create app directory
WORKDIR /app

# Install app dependencies
COPY package*.json ./
RUN npm install

# Copy app source
COPY . .

# Build the React frontend
RUN npm run build

# Expose port (Cloud Run sets PORT env var, defaulting to 8080)
EXPOSE 8080

# Start the server
CMD [ "node", "server.js" ]
