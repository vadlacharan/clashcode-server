import type { CollectionConfig } from 'payload'
import { isAdmin } from '../access/roles'

export const TestCases: CollectionConfig = {
  slug: 'test-cases',
  admin: {
    useAsTitle: 'label',
    defaultColumns: ['label', 'problem', 'isPublic', 'order'],
  },
  defaultSort: 'order',
  access: {
    // Hidden test data must never be readable outside the admin panel.
    // User-facing surfaces receive sanitized results via custom endpoints.
    read: isAdmin,
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  fields: [
    {
      name: 'problem',
      type: 'relationship',
      relationTo: 'problems',
      required: true,
      index: true,
    },
    {
      name: 'label',
      type: 'text',
      admin: { description: 'e.g. "Example 1" or "Hidden: large input"' },
    },
    {
      name: 'input',
      type: 'textarea',
      required: true,
      maxLength: 2_000_000,
      admin: { description: 'Data passed to the program via stdin' },
    },
    {
      name: 'expectedOutput',
      type: 'textarea',
      required: true,
      maxLength: 2_000_000,
      admin: { description: 'Exact expected stdout (trailing whitespace is ignored)' },
    },
    {
      name: 'isPublic',
      type: 'checkbox',
      defaultValue: false,
      admin: { description: 'Public tests are shown to players as examples' },
    },
    {
      name: 'order',
      type: 'number',
      defaultValue: 0,
    },
  ],
}
