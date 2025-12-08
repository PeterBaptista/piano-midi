"use client"

import React, { createContext, useContext, useState, useEffect } from "react"

interface User {
  username: string
  email: string
}

interface AuthContextType {
  user: User | null
  token: string | null
  login: (token: string, userData: User) => void
  logout: () => void
  isAuthenticated: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(null)

  // Carrega dados do localStorage ao iniciar
  useEffect(() => {
    const storedToken = localStorage.getItem("midi_token")
    const storedUser = localStorage.getItem("midi_user")
    
    if (storedToken && storedUser) {
      setToken(storedToken)
      setUser(JSON.parse(storedUser))
    }
  }, [])

  const login = (newToken: string, newUser: User) => {
    setToken(newToken)
    setUser(newUser)
    localStorage.setItem("midi_token", newToken)
    localStorage.setItem("midi_user", JSON.stringify(newUser))
  }

  const logout = () => {
    setToken(null)
    setUser(null)
    localStorage.removeItem("midi_token")
    localStorage.removeItem("midi_user")
  }

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isAuthenticated: !!token }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}