import { createContext } from 'react'

export type AuthUser = { id: string; username: string } | null

export type AuthResult = {
  ok: boolean
  error?: string
}

export type AuthContextValue = {
  isAuth: boolean
  me: AuthUser
  authLoading: boolean
  refreshMe: () => Promise<void>
  login: (username: string, password: string) => Promise<AuthResult>
  register: (username: string, password: string) => Promise<AuthResult>
  logout: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
