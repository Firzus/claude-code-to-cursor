#!/bin/sh
# Ensure data directories are writable by the bun user
chown -R bun:bun /data
exec su -s /bin/sh bun -c "bun run index.ts"
