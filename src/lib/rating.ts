import { ELO_K_BY_DIFFICULTY, type Difficulty } from './config'

export function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + 10 ** ((ratingB - ratingA) / 400))
}

export function eloDelta(ratingA: number, ratingB: number, scoreA: number, k: number): number {
  return Math.round(k * (scoreA - expectedScore(ratingA, ratingB)))
}

export function kFactorFor(difficulty: Difficulty): number {
  return ELO_K_BY_DIFFICULTY[difficulty] ?? 32
}
