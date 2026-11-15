# CouchDB with PrepApp's settings built in. The settings are copied into the
# image (not mounted read-only), because CouchDB's start-up script changes the
# owner of every file under /opt/couchdb and stops if it cannot.
FROM couchdb:3
COPY prepapp.ini /opt/couchdb/etc/local.d/prepapp.ini
