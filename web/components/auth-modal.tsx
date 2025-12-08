"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/app/context/auth-context"
import { X, Loader2, User, Mail, Lock } from "lucide-react"

interface AuthModalProps {
  isOpen: boolean
  onClose: () => void
}
const API_URL = process.env.NEXT_PUBLIC_API_URL!

export function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const [isLoginView, setIsLoginView] = useState(true)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  
  // Form states
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [email, setEmail] = useState("")

  const { login } = useAuth()

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError("")

    const endpoint = isLoginView ? "/login" : "/register"
    const url = `${API_URL}${endpoint}`

    const body = isLoginView 
      ? { username, password }
      : { username, email, password }

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.msg || "Ocorreu um erro")
      }

      if (isLoginView) {
        // Login com sucesso
        login(data.access_token, data.user)
        onClose()
      } else {
        // Registro com sucesso -> troca para login
        setIsLoginView(true)
        setError("Conta criada! Faça login agora.")
        setPassword("")
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="relative w-full max-w-md rounded-xl bg-slate-900 border border-slate-800 p-6 shadow-2xl">
        <button 
          onClick={onClose}
          className="absolute right-4 top-4 text-slate-400 hover:text-white"
        >
          <X className="w-5 h-5" />
        </button>

        <h2 className="text-2xl font-bold text-white mb-2">
          {isLoginView ? "Bem-vindo de volta" : "Criar conta"}
        </h2>
        <p className="text-slate-400 mb-6 text-sm">
          {isLoginView ? "Entre para salvar suas músicas e pontuações." : "Registre-se para acessar todos os recursos."}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-200">Usuário</label>
            <div className="relative">
              <User className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full rounded-md border border-slate-700 bg-slate-800 py-2 pl-9 pr-3 text-sm text-white placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="Seu usuário"
              />
            </div>
          </div>

          {!isLoginView && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-200">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-md border border-slate-700 bg-slate-800 py-2 pl-9 pr-3 text-sm text-white placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="seu@email.com"
                />
              </div>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-200">Senha</label>
            <div className="relative">
              <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border border-slate-700 bg-slate-800 py-2 pl-9 pr-3 text-sm text-white placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="••••••••"
              />
            </div>
          </div>

          {error && (
            <div className="text-red-400 text-sm bg-red-950/30 p-2 rounded border border-red-900/50">
              {error}
            </div>
          )}

          <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-500" disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isLoginView ? "Entrar" : "Cadastrar"}
          </Button>
        </form>

        <div className="mt-6 text-center text-sm">
          <span className="text-slate-400">
            {isLoginView ? "Não tem uma conta? " : "Já tem uma conta? "}
          </span>
          <button
            type="button"
            onClick={() => {
              setIsLoginView(!isLoginView)
              setError("")
            }}
            className="text-blue-400 hover:underline font-medium"
          >
            {isLoginView ? "Cadastre-se" : "Faça Login"}
          </button>
        </div>
      </div>
    </div>
  )
}