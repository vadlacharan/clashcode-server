import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

import { Users } from './collections/Users'
import { Problems } from './collections/Problems'
import { TestCases } from './collections/TestCases'
import { Matches } from './collections/Matches'
import { Submissions } from './collections/Submissions'
import endpoints from './endpoints'
import { env } from './lib/config'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  collections: [Users, Problems, TestCases, Matches, Submissions],
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URL || '',
    },
  }),
  sharp,
  serverURL: env.serverUrl,
  cors: [env.frontendUrl, env.serverUrl],
  csrf: [env.frontendUrl, env.serverUrl],
  endpoints,
  plugins: [],
})
