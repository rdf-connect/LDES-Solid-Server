# Build stage
FROM node:lts-alpine
# Set current working directory
WORKDIR /ldes-solid-server

# Copy the dockerfile's context's community server files
COPY . .
# Install and build the LDES component for the Community Solid Server
RUN npm ci --unsafe-perm && npm run build

# Prepare and install an instance of the CSS + LDES
RUN cd server
RUN npm install
WORKDIR /ldes-solid-server/server

# Informs Docker that the container listens on the specified network port at runtime
EXPOSE 3000

# Set command run by the container
ENTRYPOINT [ "npx", "@solid/community-server" ]
