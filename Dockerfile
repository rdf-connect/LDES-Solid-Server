# Build stage
FROM node:lts-alpine AS build

# Set current working directory
WORKDIR /ldes-solid-server

# Copy the dockerfile's context's community server files
COPY . .

# Install and build the Solid community server (prepare script cannot run in wd)
RUN npm ci --unsafe-perm && npm run build

RUN cd server
RUN npm install

# Runtime stage
FROM node:lts-alpine

# Add contact informations for questions about the container
LABEL maintainer="Solid Community Server Docker Image Maintainer <thomas.dupont@ugent.be>"

# Container config & data dir for volume sharing
# Defaults to filestorage with /data directory (passed through CMD below)
RUN mkdir /config /data /examples

# Set current directory
WORKDIR /ldes-solid-server



COPY ./server/examples/ /examples/
 
# Copy runtime files from build stage
COPY --from=build /ldes-solid-server/package.json .
COPY --from=build /ldes-solid-server/config ./config
COPY --from=build /ldes-solid-server/dist ./dist
COPY --from=build /ldes-solid-server/node_modules ./node_modules
COPY --from=build /ldes-solid-server/server/node_modules ./server/node_modules

# Informs Docker that the container listens on the specified network port at runtime
EXPOSE 3000

WORKDIR /ldes-solid-server/server

# Set command run by the container
ENTRYPOINT [ "npx", "community-solid-server" ]

# By default run in filemode (overriden if passing alternative arguments or env vars)
ENV CSS_CONFIG=/examples/config-ldes.json
ENV CSS_ROOT_FILE_PATH=/data
