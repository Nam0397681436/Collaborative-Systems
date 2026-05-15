"use client"

import { createContext, useContext, useState, useEffect, type ReactNode } from "react"
import { loginApi, registerApi } from "@/lib/api"

interface User {
  id: string
  username: string
  email: string
  avatar: string
}

interface AuthContextType {
  user: User | null
  isLoading: boolean
  logout: () => void
  handleUser: (user: { id: string; username: string; email: string }) => void
}

const AuthContext = createContext<AuthContextType | null>(null)
const AUTH_STORAGE_KEY = "collab_user"

function buildAvatar(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)
}

function normalizeUser( user: { id: string; username: string; email: string } , fallbackEmail: string): User {
  const apiUser = user
  if (apiUser) {
    const username = apiUser.username ?? fallbackEmail.split("@")[0]
    return {
      id: apiUser.id,
      username,
      email: apiUser.email ?? fallbackEmail,
      avatar: buildAvatar(username),
    }
  }
  // fallback khi offline / BE chưa trả đúng
  const username = fallbackEmail.split("@")[0].replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  return { id: "u1", username, email: fallbackEmail, avatar: buildAvatar(username) }
}

function persistUser(user: User) {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user))
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(AUTH_STORAGE_KEY)
      if (stored) {
        setUser(JSON.parse(stored))
      }
    } catch {
      localStorage.removeItem(AUTH_STORAGE_KEY)
    }
    setIsLoading(false)
  }, [])

  const handleUser = async (user: { id: string; username: string; email: string }) => {
    const nextUser = normalizeUser(user, user.email)
    persistUser(nextUser)
    setUser(nextUser)
  }

  const logout = () => {
    localStorage.removeItem(AUTH_STORAGE_KEY)
    setUser(null)
  }

  return <AuthContext.Provider value={{ user, isLoading, logout, handleUser }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}
