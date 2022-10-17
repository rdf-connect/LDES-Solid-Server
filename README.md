# ldes-solid-server

Linked data event stream components to configure a community solid server that exposes a LDES.
Currently only a mongodb backend is supported.


### What is a Linked Data Event Stream

A Linked Data Event Stream ([LDES](https://semiceu.github.io/LinkedDataEventStreams/)) is a collection of immutable objects (such as version objects, sensor observations or archived representation). Each object is described in RDF.

With Linked Data Event Streams, consumers can replicate and stay in sync with a stream of RDF data.

LDES uses the [TREE](https://treecg.github.io/specification/) specification, which enables API developers to define relations between HTTP resources.
A collection of items can be fragmented and these fragments can be interlinked.
A well known example is to paging, but with fragments can describe what elements can be found by following the link to another page.

## Structure

The Community Solid Server uses [ComponentsJs](https://github.com/LinkedSoftwareDependencies/Components.js) extensively, this is carried through here.


### Views

The ldes-solid-server can host multiple view on the same data. The user has to define what views are exposed on what path. 
To understand a specific  view, the ldes-server checks the database for additional information. If no information is found about that view, no view is set up.

### Timestamp path

Timestamp paths are a special fragmentation that is used widely. Enable timestamp path fragmentations in the config.

## Setup

### Local development

```bash
# Install local dependencies
yarn install
# Compile TS package
npm run build
# Setup server
cd server
npm install
npm start
```

### Use ldes-solid-server as Community Solid Server

```bash
# Install the server
npm install ldes-solid-server
# Start the server
npx community-solid-server -c config.json -f ./data
```

#### Required Configuration

The ldes-server expects some configurations, take this example css configuration file to start up a ldes-server.

This CSS uses ACL security on a file based store, it also exposes the LDES store on the '/ldes' path.
LDESConfig specifies what view to host on what paths, the uri's representing the view correspond to those found in the database.

Database configuration allows the user to configure what collections are used.


```json
{
    "@context": [
        "https://linkedsoftwaredependencies.org/bundles/npm/@solid/community-server/^3.0.0/components/context.jsonld",
        "https://linkedsoftwaredependencies.org/bundles/npm/ldes-solid-server/^0.0.0/components/context.jsonld"
    ],
    "import": [
        "files-scs:config/app/main/default.json",
        "files-scs:config/app/init/default.json",
        "files-scs:config/app/setup/optional.json",
        "files-scs:config/app/variables/default.json",
        "files-lss:config/http/default.json",
        "files-scs:config/http/middleware/websockets.json",
        "files-scs:config/http/server-factory/websockets.json",
        "files-scs:config/http/static/default.json",
        "files-scs:config/identity/access/public.json",
        "files-scs:config/identity/email/default.json",
        "files-scs:config/identity/handler/default.json",
        "files-scs:config/identity/ownership/token.json",
        "files-scs:config/identity/pod/static.json",
        "files-scs:config/identity/registration/enabled.json",
        "files-scs:config/ldp/authentication/dpop-bearer.json",
        "files-scs:config/ldp/authorization/webacl.json",
        "files-scs:config/ldp/handler/default.json",
        "files-lss:config/ldp/handler/default.json",
        "files-scs:config/ldp/metadata-parser/default.json",
        "files-lss:config/ldp/metadata-writer/default.json",
        "files-scs:config/ldp/modes/default.json",
        "files-scs:config/storage/key-value/resource-store.json",
        "files-scs:config/storage/middleware/default.json",
        "files-scs:config/util/auxiliary/acl.json",
        "files-scs:config/util/identifiers/suffix.json",
        "files-scs:config/util/index/default.json",
        "files-scs:config/util/logging/winston.json",
        "files-scs:config/util/representation-conversion/default.json",
        "files-scs:config/util/resource-locker/memory.json",
        "files-scs:config/util/variables/default.json",
        "files-scs:config/storage/backend/data-accessors/sparql-endpoint.json",
        "files-scs:config/storage/backend/data-accessors/file.json",
        "files-lss:config/storage/backend/ldes.json"
    ],
    "@graph": [
        {
            "comment": "A single-pod server that exposes Linked Data Event Streams."
        },
        {
            "comment": "A more complex example with 3 different stores being routed to.",
            "@id": "urn:solid-server:default:ResourceStore_Backend",
            "@type": "RoutingResourceStore",
            "rule": {
                "@id": "urn:solid-server:default:RouterRule"
            }
        },
        {
            "@id": "urn:solid-server:default:RouterRule",
            "@type": "RegexRouterRule",
            "base": {
                "@id": "urn:solid-server:default:variable:baseUrl"
            },
            "storeMap": [
                {
                    "RegexRouterRule:_storeMap_key": "^/(\\.acl)?$",
                    "RegexRouterRule:_storeMap_value": {
                        "@id": "urn:solid-server:default:FileResourceStore"
                    }
                },
                {
                    "RegexRouterRule:_storeMap_key": "^/ldes/(?!.*acl$).*$",
                    "RegexRouterRule:_storeMap_value": {
                        "@type": "RepresentationConvertingStore",
                        "source": {
                            "@id": "urn:solid-server:default:LDESResourceStore"
                        },
                        "options_outConverter": {
                            "@id": "urn:solid-server:default:RepresentationConverter"
                        }
                    }
                },
                {
                    "RegexRouterRule:_storeMap_key": "/",
                    "RegexRouterRule:_storeMap_value": {
                        "@id": "urn:solid-server:default:FileResourceStore"
                    }
                }
            ]
        },
        {
            "@id": "urn:solid-server:default:FileResourceStore",
            "@type": "DataAccessorBasedStore",
            "identifierStrategy": {
                "@id": "urn:solid-server:default:IdentifierStrategy"
            },
            "auxiliaryStrategy": {
                "@id": "urn:solid-server:default:AuxiliaryStrategy"
            },
            "accessor": {
                "@id": "urn:solid-server:default:FileDataAccessor"
            }
        },
        {
            "@id": "urn:solid-server:default:LDESConfig",
            "@type": "Config",
            "ldesConfig": [
                {
                    "Config:_ldesConfig_key": "default",
                    "Config:_ldesConfig_value": "http://example.org/ns#time"
                },
                {
                    "Config:_ldesConfig_key": "mine",
                    "Config:_ldesConfig_value": "http://example.org/ns#BucketizeStrategy"
                }
            ],
            "timestampFragmentation": "http://example.org/ns#time"
        },
        {
            "@id": "urn:solid-server:default:LDESDBConfig",
            "@type": "DBConfig",
            "metaCollection": "meta",
            "indexCollection": "index",
            "membersCollection": "data",
            "dbUrl": "mongodb://localhost:27017",
            "dbName": "ldes"
        }
    ]
}
```

