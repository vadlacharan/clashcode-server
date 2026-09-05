import type { CollectionConfig } from 'payload'
import { authenticated, isAdmin } from '../access/roles'
import { DIFFICULTIES, LANGUAGES, type Difficulty } from '../lib/config'

export const Problems: CollectionConfig = {
  slug: 'problems',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'slug', 'difficulty', 'timeLimitSeconds'],
  },
  access: {
    read: authenticated,
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  hooks: {
    beforeOperation: [
      async ({ req, args, operation }) => {
        if (operation === 'delete') {
          const id = (args as { id?: string }).id
          if (id) {
            const { totalDocs } = await req.payload.count({
              collection: 'matches',
              where: { problem: { equals: id } },
            })
            if (totalDocs > 0) {
              throw new Error('Cannot delete a problem that has been used in matches')
            }
          }
        }
      },
    ],
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    {
      name: 'slug',
      type: 'text',
      required: true,
      unique: true,
      index: true,
    },
    {
      name: 'difficulty',
      type: 'select',
      required: true,
      defaultValue: 'medium',
      options: DIFFICULTIES.map((d: Difficulty) => ({
        label: d.charAt(0).toUpperCase() + d.slice(1),
        value: d,
      })),
    },
    {
      name: 'timeLimitSeconds',
      type: 'number',
      required: true,
      defaultValue: 900,
      admin: {
        description: 'Match duration in seconds when this problem is played (60 - 7200)',
      },
      validate: (value: unknown) => {
        const n = Number(value)
        if (!Number.isFinite(n) || n < 60 || n > 7200) {
          return 'Time limit must be between 60 and 7200 seconds'
        }
        return true
      },
    },
    {
      name: 'cpuTimeSeconds',
      type: 'number',
      defaultValue: 5,
      admin: {
        description: 'Per-test execution time limit in seconds (1 - 15)',
      },
      validate: (value: unknown) => {
        const n = Number(value)
        if (!Number.isFinite(n) || n < 1 || n > 15) {
          return 'CPU time limit must be between 1 and 15 seconds'
        }
        return true
      },
    },
    {
      name: 'statement',
      type: 'richText',
      required: true,
    },
    {
      name: 'constraints',
      type: 'textarea',
      admin: { description: 'Input constraints shown to players (plain text)' },
    },
    {
      name: 'tags',
      type: 'array',
      fields: [{ name: 'tag', type: 'text', required: true }],
    },
    {
      name: 'starterTemplates',
      type: 'array',
      labels: { singular: 'Starter template', plural: 'Starter templates' },
      fields: [
        {
          name: 'language',
          type: 'select',
          required: true,
          options: LANGUAGES.map((l) => ({ label: l.label, value: l.id })),
        },
        { name: 'code', type: 'textarea', required: true },
      ],
    },
  ],
}
