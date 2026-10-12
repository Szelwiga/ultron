# Doki

Doki is the AI typing web application but oriented across documents;
you can think about it like an antigravity for people who work
with the documents.

## Design

Doki backend is implemented in java. With the frontend / backend
communication as proto over rest API and Make as the build system.

### Directory breakdown

* deployment/ - daemons / installation / running / config
* utilities/ - development utilities
* java/models/ - layer for translation of internal conv representation
* java/ultron/ - harness logic
* java/server/ - infrastructure for http server and universal handlers
* java/service/ - universal rest API handlers (e.g. auth)
* java/dbs/ - universal database wrapper functions (e.g. users, sessions)
* java/doki/ - application-specific backend code:
  * java/doki/dbs/ - doki database wrappers (e.g. workspaces)
  * java/doki/service/ - doki domain services
  * java/doki/server/ - doki HTTP handlers
* javatests/ - unit tests
* integration/ - integration tests
* web/ - frontend assets:
  * web/index.html - entry redirect to /doki/studio.html
  * web/login/ - universal UI for logging in
  * web/common/ - shared styles and theme
  * web/doki/ - application workspace studio (studio.html, studio.js)
  * web/canvas/ - layout manager / dragging the tiles
  * web/nav/ - top bar of the app that allows toggling tiles
  * web/doc/ - document editor tile
  * web/welcome/ - welcome tile (shows recent documents / convs)
  * web/chat/ - chat tile with agent incl conv history
  * web/tree/ - tree selector tile for documents
  * web/import/ - file import tile
  * web/settings/ - settings tile
* proto/ - proto definitions:
  * proto/ - universal proto schemas (auth.proto)
  * proto/doki/ - application-specific proto schemas (workspace.proto)
* run/build/ - build artifacts
* run/logs/ - logging output
* run/storage/ - databases
* specs/ - specification files:
  * specs/ - universal specs (auth_spec.md)
  * specs/doki/ - application-specific specs (workspace_spec.md)

### Auth

Logging in / registering should only be exposes via Log in with
Google.

### Dbs

At this moment we maintain the storage as clear textproto and agree
with iterating over all records for the storage calls.

## Code practices

Try to keep each file up to 300 lines long with 80 characters
line length limit. For each function provide a short max 3 lines 
comment on what it does.
