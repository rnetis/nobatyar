import { PrismaClient } from './client/index.js'
import { PrismaBetterSQLite3 } from '@prisma/adapter-better-sqlite3'
import Database from 'better-sqlite3'
import { readFileSync, rmSync } from 'node:fs'

const file = process.env.TEST_DB || './test.db'
rmSync(file, { force: true })
const raw = new Database(file)
raw.exec(readFileSync('./ddl.sql', 'utf8'))
raw.close()
export const db = new PrismaClient({ adapter: new PrismaBetterSQLite3({ url: `file:${file}` }) })
