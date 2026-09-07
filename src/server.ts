import 'dotenv/config'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import next from 'next'
import { attachSocketServer } from './realtime/io'

const port = Number(process.env.PORT || 3000)
const hostname = process.env.HOSTNAME || 'localhost'
const dev = process.env.NODE_ENV !== 'production'

async function main(): Promise<void> {
  const app = next({ dev, hostname, port })
  const handle = app.getRequestHandler()

  await app.prepare()

  const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    try {
      await handle(req, res)
    } catch (err) {
      console.error('[server] request handling error', err)
      res.statusCode = 500
      res.end('internal server error')
    }
  })

  attachSocketServer(httpServer)

  httpServer.listen(port, () => {
    console.log(`> Syntax School backend ready on http://${hostname}:${port} (${dev ? 'dev' : 'production'})`)
    console.log('> Socket.IO attached to the same server')
  })
}

main().catch((err) => {
  console.error('[server] fatal', err)
  process.exit(1)
})
