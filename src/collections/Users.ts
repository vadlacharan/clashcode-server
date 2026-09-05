import type { CollectionConfig } from 'payload'
import { isAdmin, isAdminFieldLevel, isAdminOrSelf } from '../access/roles'
import { DEFAULT_RATING } from '../lib/config'

const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,20}$/

export const Users: CollectionConfig = {
  slug: 'users',
  admin: {
    useAsTitle: 'username',
    defaultColumns: ['username', 'role', 'rating', 'wins', 'losses', 'draws'],
  },
  auth: {
    tokenExpiration: 60 * 60 * 24 * 7,
    maxLoginAttempts: 10,
    lockTime: 10 * 60 * 1000,
    loginWithUsername: true,
  },
  access: {
    create: () => true,
    read: isAdminOrSelf,
    update: isAdminOrSelf,
    delete: isAdmin,
  },
  hooks: {
    beforeChange: [
      ({ data, operation }) => {
        if (data?.username) {
          data.username = String(data.username).trim()
          if (!USERNAME_REGEX.test(data.username)) {
            throw new Error(
              'Username must be 3-20 characters and contain only letters, numbers and underscores',
            )
          }
        }
        if (operation === 'create' && !data?.username) {
          throw new Error('Username is required')
        }
      },
      async ({ data, req, operation }) => {
        if (operation === 'create') {
          const { totalDocs } = await req.payload.count({ collection: 'users' })
          if (totalDocs === 0) {
            data.role = 'admin'
          }
        }
      },
    ],
  },
  fields: [
    // `username` + `password` are added automatically via `loginWithUsername: true`
    {
      name: 'role',
      type: 'select',
      required: true,
      defaultValue: 'user',
      access: { update: isAdminFieldLevel },
      admin: { position: 'sidebar' },
      options: [
        { label: 'User', value: 'user' },
        { label: 'Admin', value: 'admin' },
      ],
    },
    {
      name: 'rating',
      type: 'number',
      defaultValue: DEFAULT_RATING,
      access: { update: isAdminFieldLevel },
      admin: { position: 'sidebar' },
    },
    {
      name: 'wins',
      type: 'number',
      defaultValue: 0,
      access: { update: isAdminFieldLevel },
      admin: { position: 'sidebar' },
    },
    {
      name: 'losses',
      type: 'number',
      defaultValue: 0,
      access: { update: isAdminFieldLevel },
      admin: { position: 'sidebar' },
    },
    {
      name: 'draws',
      type: 'number',
      defaultValue: 0,
      access: { update: isAdminFieldLevel },
      admin: { position: 'sidebar' },
    },
  ],
}
