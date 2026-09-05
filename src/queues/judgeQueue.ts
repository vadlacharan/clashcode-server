import { Queue } from 'bullmq'
import { getRedis, createBullConnection } from './connection'

export const JUDGE_QUEUE_NAME = 'cc-judge'

export type JudgeJobData = {
  /** Only present on challenge-expiry jobs. */
  challengeId?: string
  /** Present on judge jobs. */
  submissionId?: string
  matchId?: string
  authorId?: string
}

const globalForQueues = globalThis as typeof globalThis & {
  __ccJudgeQueue?: Queue<JudgeJobData>
}

export function getJudgeQueue(): Queue<JudgeJobData> {
  if (!globalForQueues.__ccJudgeQueue) {
    globalForQueues.__ccJudgeQueue = new Queue<JudgeJobData>(JUDGE_QUEUE_NAME, {
      connection: createBullConnection(),
    })
  }
  return globalForQueues.__ccJudgeQueue
}

export async function enqueueJudgeJob(data: JudgeJobData): Promise<void> {
  const queue = getJudgeQueue()
  await queue.add('judge', data, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2_000 },
    removeOnComplete: 100,
    removeOnFail: 200,
  })
}

/** Exposed for workers that need a shared redis client without BullMQ. */
export { getRedis }
