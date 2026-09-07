import type { Endpoint } from 'payload'
import { joinMatchmaking, leaveMatchmaking } from './matchmaking'
import { activeMatch } from './active'
import { viewMatch } from './view'
import { runCode } from './run'
import { submitSolution } from './submit'
import { forfeitMatch } from './forfeit'
import { matchHistory } from './history'
import { leaderboard } from './leaderboard'
import { startSolve, endSolve } from './solve'
import {
  sendChallenge,
  acceptChallenge,
  declineChallenge,
  cancelChallenge,
  pendingChallenges,
} from './challenges'

const endpoints: Endpoint[] = [
  { path: '/matchmaking/join', method: 'post', handler: joinMatchmaking },
  { path: '/matchmaking/leave', method: 'post', handler: leaveMatchmaking },
  { path: '/match/active', method: 'get', handler: activeMatch },
  { path: '/match/view', method: 'get', handler: viewMatch },
  { path: '/match/run', method: 'post', handler: runCode },
  { path: '/match/submit', method: 'post', handler: submitSolution },
  { path: '/match/forfeit', method: 'post', handler: forfeitMatch },
  { path: '/match/history', method: 'get', handler: matchHistory },
  { path: '/leaderboard', method: 'get', handler: leaderboard },
  { path: '/challenges/send', method: 'post', handler: sendChallenge },
  { path: '/challenges/accept', method: 'post', handler: acceptChallenge },
  { path: '/challenges/decline', method: 'post', handler: declineChallenge },
  { path: '/challenges/cancel', method: 'post', handler: cancelChallenge },
  { path: '/challenges/pending', method: 'get', handler: pendingChallenges },
  { path: '/solve/start', method: 'post', handler: startSolve },
  { path: '/solve/end', method: 'post', handler: endSolve },
]

export default endpoints
