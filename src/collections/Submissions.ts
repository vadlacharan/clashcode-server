import type { CollectionConfig } from 'payload'
import { isAdmin } from '../access/roles'
import { LANGUAGE_IDS } from '../lib/config'

export const Submissions: CollectionConfig = {
  slug: 'submissions',
  admin: {
    useAsTitle: 'id',
    defaultColumns: ['id', 'match', 'author', 'language', 'status', 'passedCount', 'totalCount'],
  },
  access: {
    // Submissions are created by backend logic only (never via REST create)
    create: () => false,
    read: ({ req }) => {
      if (!req.user) return false
      if ((req.user as { role?: string }).role === 'admin') return true
      return { author: { equals: req.user.id } }
    },
    update: () => false,
    delete: isAdmin,
  },
  fields: [
    { name: 'match', type: 'relationship', relationTo: 'matches', required: true, index: true },
    { name: 'author', type: 'relationship', relationTo: 'users', required: true, index: true },
    {
      name: 'language',
      type: 'select',
      required: true,
      options: LANGUAGE_IDS.map((id) => ({ label: id, value: id })),
    },
    { name: 'code', type: 'textarea', required: true },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'pending',
      index: true,
      options: [
        { label: 'Pending', value: 'pending' },
        { label: 'Judging', value: 'judging' },
        { label: 'Accepted', value: 'accepted' },
        { label: 'Wrong Answer', value: 'wrong_answer' },
        { label: 'Runtime Error', value: 'runtime_error' },
        { label: 'Compile Error', value: 'compile_error' },
        { label: 'Timeout', value: 'timeout' },
        { label: 'Judge Error', value: 'judge_error' },
      ],
    },
    { name: 'testResults', type: 'json' },
    { name: 'passedCount', type: 'number', defaultValue: 0 },
    { name: 'totalCount', type: 'number', defaultValue: 0 },
    { name: 'judgedAt', type: 'date' },
  ],
}
