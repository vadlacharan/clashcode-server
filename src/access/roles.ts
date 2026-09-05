import type { Access, AccessArgs, FieldAccess } from 'payload'

type RoleLike = { role?: string } | null | undefined

export const isAdmin = ({ req }: AccessArgs): boolean => {
  return (req.user as RoleLike)?.role === 'admin'
}

export const authenticated: Access = ({ req }) => Boolean(req.user)

export const isAdminOrSelf: Access = ({ req }) => {
  if (!req.user) return false
  if ((req.user as RoleLike)?.role === 'admin') return true
  return { id: { equals: req.user.id } }
}

export const isAdminFieldLevel: FieldAccess = ({ req }) => {
  return (req.user as RoleLike)?.role === 'admin'
}
