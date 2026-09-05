import type { CollectionConfig, Where } from 'payload'
import { isAdmin } from '../access/roles'
import { emptyPlayerStats } from '../lib/matchState'

export const Matches: CollectionConfig = {
  slug: 'matches',
  admin: {
    useAsTitle: 'id',
    defaultColumns: ['playerOne', 'playerTwo', 'problem', 'status', 'endReason', 'winner'],
  },
  access: {
    read: ({ req }) => {
      if (!req.user) return false
      if ((req.user as { role?: string }).role === 'admin') return true
      const participant: Where = {
        or: [{ playerOne: { equals: req.user.id } }, { playerTwo: { equals: req.user.id } }],
      }
      return participant
    },
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  fields: [
    { name: 'playerOne', type: 'relationship', relationTo: 'users', required: true, index: true },
    { name: 'playerTwo', type: 'relationship', relationTo: 'users', required: true, index: true },
    { name: 'problem', type: 'relationship', relationTo: 'problems', required: true, index: true },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'active',
      index: true,
      options: [
        { label: 'Active', value: 'active' },
        { label: 'Finished', value: 'finished' },
        { label: 'Aborted', value: 'aborted' },
      ],
    },
    {
      name: 'endReason',
      type: 'select',
      options: [
        { label: 'Solved', value: 'solved' },
        { label: 'Timeout', value: 'timeout' },
        { label: 'Forfeit', value: 'forfeit' },
        { label: 'Aborted', value: 'aborted' },
      ],
    },
    { name: 'winner', type: 'relationship', relationTo: 'users', index: true },
    { name: 'startedAt', type: 'date', admin: { position: 'sidebar' } },
    { name: 'endedAt', type: 'date', admin: { position: 'sidebar' } },
    {
      name: 'playerOneStats',
      type: 'json',
      defaultValue: emptyPlayerStats,
    },
    {
      name: 'playerTwoStats',
      type: 'json',
      defaultValue: emptyPlayerStats,
    },
    {
      name: 'ratings',
      type: 'json',
      admin: {
        description: 'Rating snapshot applied when the match finished',
      },
    },
  ],
}
