import 'dotenv/config'
import { Worker } from 'bullmq'
import { getPayload } from 'payload'
import config from '../payload.config'
import { JUDGE_QUEUE_NAME } from '../queues/judgeQueue'
import { createBullConnection } from '../queues/connection'
import { processJudgeJob } from './judge.worker'
import { runMatchmakerOnce } from './matchmaker.worker'
import { runSweepOnce } from './sweeper.worker'

const globalForWorkers = globalThis as typeof globalThis & {
  __ccWorkersStarted?: boolean
}

async function main(): Promise<void> {
  const payload = await getPayload({ config })

  if (globalForWorkers.__ccWorkersStarted) {
    console.warn('[workers] already started')
    return
  }
  globalForWorkers.__ccWorkersStarted = true

  // --- Judge worker ---------------------------------------------------------
  const judgeWorker = new Worker<{ submissionId: string; matchId: string; authorId: string }>(
    JUDGE_QUEUE_NAME,
    async (job) => processJudgeJob(payload, job),
    {
      connection: createBullConnection(),
      concurrency: 2,
      lockDuration: 120_000,
    },
  )
  judgeWorker.on('failed', (job, err) => {
    console.error(`[judge] job ${job?.id} failed (attempt ${job?.attemptsMade})`, err)
  })

  // --- Matchmaker (repeatable every second) ---------------------------------
  const _matchmaker = new Worker(
    'cc-matchmaker',
    async () => {
      await runMatchmakerOnce(payload)
    },
    { connection: createBullConnection(), concurrency: 1 },
  )

  const { Queue: BullQueue } = await import('bullmq')
  const matchmakerQueue = new BullQueue('cc-matchmaker', {
    connection: createBullConnection(),
  })
  await matchmakerQueue.upsertJobScheduler(
    'matchmaker-tick',
    { every: 1_000 },
    { name: 'tick', data: {}, opts: { removeOnComplete: 10, removeOnFail: 10 } },
  )

  // --- Sweeper (repeatable every 5 seconds) ---------------------------------
  const _sweeper = new Worker(
    'cc-sweeper',
    async () => {
      await runSweepOnce(payload)
    },
    { connection: createBullConnection(), concurrency: 1 },
  )
  const sweeperQueue = new BullQueue('cc-sweeper', { connection: createBullConnection() })
  await sweeperQueue.upsertJobScheduler(
    'sweeper-tick',
    { every: 5_000 },
    { name: 'tick', data: {}, opts: { removeOnComplete: 10, removeOnFail: 10 } },
  )

  console.info('[workers] judge, matchmaker and sweeper workers started')
}

main().catch((err) => {
  console.error('[workers] fatal', err)
  process.exit(1)
})
