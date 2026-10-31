# Integration tests (queue engine, booking, state machine, plan limits)

Runs the real route handlers and `queue-engine` against a throw-away SQLite file.
Only `@/lib/auth` (cookies) and `@/lib/db` (driver-adapter client) are swapped for test doubles.

```bash
cd tests/integration
npm i --no-save @prisma/client@6.19.3 prisma@6.19.3 @prisma/adapter-better-sqlite3@6.19.3 better-sqlite3 tsx
npx prisma generate --schema schema.test.prisma                 # engine-less client → ./client
sqlite3 ../../db/dev.db .schema > ddl.sql                       # or: prisma db push, then dump the schema
cat > tsconfig.json <<'JSON'
{ "compilerOptions": { "module": "esnext", "moduleResolution": "bundler", "target": "es2022", "baseUrl": ".",
  "paths": { "@/lib/db": ["./db.ts"], "@/lib/auth": ["./auth-stub.ts"], "@/*": ["../../src/*"] } } }
JSON
TZ=Asia/Tehran npx tsx --tsconfig ./tsconfig.json --test engine.test.ts
```
