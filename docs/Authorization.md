# LDES configuration with authorization

## Web Access Control

Access control is specified using [Web Access Control (WAC)](https://solid.github.io/web-access-control-spec/).
WAC uses Access Control Lists (ACLs) to define **who** has access to **what** Resources, with different kinds of permissions.

## Configuration

A default configuration, like [config-ldes.json](../server/examples/config-ldes.json), allows for everybody to interact using any mode with the server.

The [config-ldes-acl.json](../server/examples/config-ldes-acl.json) allows for administrators of the server to define authorization over the LDES using ACL resources.

### How does it work?

Just like the normal LDES-Solid-Server, a router rule and some regexes are defined, so we have a different `ResourceStore` depending on the route that is called.

For the LDES-Solid-Server with WAC authorization, there are three regex rules configured.

1. The LDES regex rule
2. The ACL regex rule
3. The Solid regex rule

The first rule its regex is `^/ldes/(?!.*acl$).*$` and has as source `LDESStore` `ResouceStore`s.
The rule matches _any URL of the form `baseURL/ldes/*` that does not end with `.acl`_.
This means that all ldes requests are passed to the configured LDES Stores, which is similar to the behaviour of normal configurations.

The second rule its regex is `^/(\\.acl)?$` and has a source a backend Solid resource store (e.g. a File Backend Store).
It matches _any URL that ends with `.acl`_, which means that we can configure specific restrictions on ldes fragments using ACL (note: only all views have been tested thus far).
This allows for modifying `.acl` resources as is defined in the WAC specification. 
It uses the [Community Solid Server](https://github.com/CommunitySolidServer/CommunitySolidServer) `"css:config/ldp/authorization/webacl.json"` config to read `.acl` and provide authorization over any resource on the server.

Finally, there is a catch-all regex rule `/`, which allows the server to have `.meta` resources. 
Without this rule, the server still works, auxiliary `.meta` resources do not.

#### Notes

* As of 24/04/2023, the LDES-Solid-server only supports [`acl:Read`](https://solid.github.io/web-access-control-spec/) requests on its resources.
* Resource stores like the File Backend Store or Memory Backend Stores must be defined in a config (preferably with an identifier), so they can be used by the second or third rule.
  This means that the corresponding data accessor also must be imported (e.g. `"css:config/storage/backend/data-accessors/file.json"`)
  * File Backend Store:
    ```json
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
      },
      "metadataStrategy": {
        "@id": "urn:solid-server:default:MetadataStrategy"
      }
    }
    ```
  * Memory Backend Store:
    ```json
        {
      "@id": "urn:solid-server:default:MemoryResourceStore",
      "@type": "DataAccessorBasedStore",
      "identifierStrategy": {
        "@id": "urn:solid-server:default:IdentifierStrategy"
      },
      "auxiliaryStrategy": {
        "@id": "urn:solid-server:default:AuxiliaryStrategy"
      },
      "accessor": {
        "@id": "urn:solid-server:default:MemoryDataAccessor"
      },
      "metadataStrategy": {
        "@id": "urn:solid-server:default:MetadataStrategy"
      }
    }
    ```

## Credits

Based on the work of Andreas Mechelinck his master thesis.

