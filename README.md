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
* java/models/ - layer for translation of internal conv representation into AI api calls
* java/ultron/ - harness logic
* java/server/ - infrastructure for http server
* java/service/ - rest API handlers
* java/dbs/ - database wrapper functions
* javatests/ - unit tests
* integration/ - integration tests
* web/canvas/ - layout manager / dragging the tiles
* web/nav/ - top bar od the entire app that allows to toggle tiles
* web/doc/ - a document editor tile
* web/welcome/ - a welcome tile (shows recent documents / convs)
* web/chat/ - a chat tile to chat with the agent incl conv history
* web/tree/ - a tile for tree selector for documents
* web/import/ - a tile for importing new files
* web/login/ - UI for logging in
* proto/ - all proto definitions
* run/build/ - build artifacts should land there
* run/logs/ - logging output should go there
* run/storage/ - databases
* specs/ - md files for specification

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
