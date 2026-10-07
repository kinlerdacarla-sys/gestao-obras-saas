#!/bin/sh
set -eu
# Every command must succeed. PostgreSQL/Redis are dedicated Compose services.
npm run migrate
npx prisma migrate status
npm run lint
npm run typecheck
npm test
npm run test:integration
npm run seed
npm run build
npm run test:e2e
