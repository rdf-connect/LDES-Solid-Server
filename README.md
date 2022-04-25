# ldes-solid-server

Linked data event stream components to configure a community solid server to expose a LDES.


### What is a Linked Data Event Stream

A Linked Data Event Stream ([LDES](https://semiceu.github.io/LinkedDataEventStreams/)) is a collection of immutable objects (such as version objects, sensor observations or archived representation). Each object is described in RDF.

The objective of a Linked Data Event Stream is to allow consumers to replicate all of its items and to stay in sync when items are added.


LDES uses the [TREE](https://treecg.github.io/specification/) specification, which enables API developers to define relations between HTTP resources.
A collection of items can be fragmented and these fragments can be interlinked.
A well known example is to paging, but with fragments can describe what elements can be found by following the link to another page.


## Structure

The Community Solid Server uses [ComponentsJs](https://github.com/LinkedSoftwareDependencies/Components.js) extensively, this is carried through here.
The ldes-solid server can expose LDES and can ingest LDES at the same time. This is equivalent to reading and writing to a store.

The ldes-solid-server explicitly supports spinning up a StreamReader to continue ingesting data, because LDES is designed to keep applications in sync. 

### Fragments

A fragment is identified by some indices and these indices can be extracted at two different stages:
- Ingest: when a member is ingested extractors extract the required indices from that member. This is done in two stages:
  - Member specific: extract an indices from that member itself.
  - Index specific: extract additional indices from the already extracted indices. Something like a page index.
- Fetch: when a fragment is fetched from a specific URL the path and query parameters of this url indicate what fragment is expected.

> Note: when ingesting a member, this member can reside in multiple fragments: a member can have multiple values for a specific property. This creates an index tree.

### Store

The ldes-solid-server currently supports two stores: a simple memory store and a mongo based store.
The memory store builds fragments in memory with nested dictionaries based on the indices.
The mongo based store stores all members in a MongoDb with an added field that indicates the indices.


## Setup

```bash
git clone https://github.com/TREEcg/ldes-solid-server
yarn install
yarn run build

# start a community solid server with LDES
cd server
npm i
npm start
```
