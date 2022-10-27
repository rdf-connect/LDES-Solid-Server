# ldes-solid-server

Linked data event stream components to configure a community solid server that exposes a LDES.
Currently, only a MongoDB backend is supported.

### What is a Linked Data Event Stream

A Linked Data Event Stream ([LDES](https://semiceu.github.io/LinkedDataEventStreams/)) is a collection of immutable objects (such as version objects, sensor observations or archived representation). Each object is described in RDF.

With Linked Data Event Streams, consumers can replicate and stay in sync with a stream of RDF data.

LDES uses the [TREE](https://treecg.github.io/specification/) specification, which enables API developers to define relations between HTTP resources.
A collection of items is divided into interlinked fragments.
A well-known example is paging, but fragments can describe what elements can be found by following the link to another page.

## Setup

### Local development

```bash
# Install local dependencies
npm install
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

See config/default.json for an example ldes-solid-server configuration.

You will probably want to configure a `urn:solid-server:default:LDESConfig` and a `urn:solid-server:default:LDESDBConfig` yourself.

**LDESConfig**

- `views` takes multiple view configurations. It is expected that information about each view can be found in the database. Specify the prefix and the stream identifier.

```json
{
  "@id": "urn:solid-server:default:LDESConfig",
  "@type": "LDESViews",
  "views": [
    {
      "@type": "LDESView",
      "prefix": "default",
      "streamId": "http://me#csvStream"
    },
    {
      "@type": "LDESView",
      "prefix": "mine",
      "streamId": "http://mine.org/rdfstream"
    }
  ]
}
```


**LDESDBConfig**

- optional: `dbUrl` specifies the mongodb location, defaults to "mongodb://localhost:27017/ldes".
- `dataCollection` specifies the data collection, this collection contains the entire LDES dataset. JSON objects with the following fields:
    - `id` of the member
    - `data` raw turtle representing the datat
    - optional `timestamp` specified by the LDES
- `indexCollection` specifies the index collection, this collection contains information about all fragments and links between fragments. JSON objects with the following fields:
    - `streamId` is the identifier of the consumed stream.
    - `id` of the fragment (can be empty)
    - `count` specifies the number of members already present in this fragment
    - `members` is an array of all contained members
    - `relations` is an array with all relations starting from this fragment. JSON objects with the following fields:
        - `type` of the relation
        - `value` of the relation
        - `bucket` is the target fragment id
        - `path` of the relation
    - optional `timeStamp` specifies the starting timestamp of this fragment.
- `metaCollection` specifies the metadata collection, this collection contains information about each ingested stream. JSON objects with following fields:
    - `id` the id of the ingested stream.
    - `type` specifies the metadata type. Often "https://w3id.org/sds#Stream".
    - `value` the actual metadata, example below:
```turtle
@prefix ns0: <http://purl.org/net/p-plan#> .
@prefix ns1: <https://w3id.org/sds#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix prov: <http://www.w3.org/ns/prov#> .
@prefix void: <http://rdfs.org/ns/void#> .
@prefix ns2: <http://www.w3.org/ns/shacl#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
@prefix ns3: <https://www.w3.org/ns/dcat#> .
@prefix foaf: <http://xmlns.com/foaf/0.1/> .
@prefix ns4: <https://w3id.org/ldes#> .

<http://me#csvStream>
  a <https://w3id.org/sds#Stream> ;
  ns0:wasGeneratedBy <http://me#readCsv> ;
  ns1:carries <http://me#csvShape> ;
  ns1:dataset <http://me#dataset> .

<http://me#readCsv>
  a ns0:Activity ;
  rdfs:comment "Reads csv file and converts to rdf members" ;
  prov:used [
    a void:Dataset ;
    void:dataDump <file:///data/input.csv>
  ] .

<http://me#csvShape>
  a ns1:Member ;
  ns1:shape <http://example.org/ns#PointShape> .

<http://example.org/ns#PointShape>
  a <http://www.w3.org/ns/shacl#NodeShape> ;
  ns2:targetClass <http://example.org/ns#Point> ;
  ns2:property [
    ns2:path <http://example.org/ns#x> ;
    ns2:datatype xsd:integer ;
    ns2:minCount 1 ;
    ns2:maxCount 1
  ], [
    ns2:path <http://example.org/ns#y> ;
    ns2:datatype xsd:integer ;
    ns2:minCount 1 ;
    ns2:maxCount 1
  ] .

<http://me#dataset>
  a <https://www.w3.org/ns/dcat#Dataset> ;
  ns3:title "Epic dataset" ;
  ns3:publisher [ foaf:name "Arthur Vercruysse" ] ;
  ns4:timestampPath <http://example.org/ns#time> ;
  ns3:identifier <http://localhost:3000/ldes> .
```

