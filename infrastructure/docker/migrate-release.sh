#!/bin/sh
set -eu
# Only a one-off release task executes this file; serving containers never migrate.
npx --no-install prisma validate
node infrastructure/release/migration-preflight.mjs
npm run migrate
npx --no-install prisma migrate status
