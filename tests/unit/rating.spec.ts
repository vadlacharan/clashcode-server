import { describe, expect, it } from 'vitest'
import { expectedScore, eloDelta, kFactorFor } from '../../src/lib/rating'

describe('Elo rating', () => {
  it('expected score is 0.5 for equal ratings', () => {
    expect(expectedScore(1200, 1200)).toBeCloseTo(0.5)
  })

  it('expected score favors the higher-rated player', () => {
    expect(expectedScore(1400, 1000)).toBeGreaterThan(0.9)
    expect(expectedScore(1000, 1400)).toBeLessThan(0.1)
  })

  it('equal ratings: a win earns exactly K/2', () => {
    expect(eloDelta(1200, 1200, 1, 32)).toBe(16)
    expect(eloDelta(1200, 1200, 0, 32)).toBe(-16)
    expect(eloDelta(1200, 1200, 0.5, 32)).toBe(0)
  })

  it('upsets swing more than expected wins', () => {
    const upset = eloDelta(1000, 1400, 1, 32)
    const expectedWin = eloDelta(1400, 1000, 1, 32)
    expect(Math.abs(upset)).toBeGreaterThan(Math.abs(expectedWin))
  })

  it('k factor maps from difficulty', () => {
    expect(kFactorFor('easy')).toBe(16)
    expect(kFactorFor('medium')).toBe(32)
    expect(kFactorFor('hard')).toBe(48)
    expect(kFactorFor('insane')).toBe(64)
  })
})
