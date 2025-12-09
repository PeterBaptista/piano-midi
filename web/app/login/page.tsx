'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [login, setLogin] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [isCadastro, setIsCadastro] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    if (!login || !senha) {
      setErro('Preencha login e senha');
      return;
    }
    setLoading(true);
    try {
      const endpoint = isCadastro ? '/cadastro' : '/login';
      const res = await fetch(
        process.env.NEXT_PUBLIC_API_URL
          ? `${process.env.NEXT_PUBLIC_API_URL}${endpoint}`
          : `http://localhost:5000${endpoint}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ login, senha }),
        }
      );
      const data = await res.json();
      if (data.success) {
        if (isCadastro) {
          setIsCadastro(false);
          setErro('');
          setLogin('');
          setSenha('');
        } else {
          localStorage.setItem('logado', 'true');
          router.push('/');
        }
      } else {
        setErro(data.error || 'Erro desconhecido');
      }
    } catch (err) {
      setErro('Erro de conexão com o servidor');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#f5f5f5'
    }}>
      <form onSubmit={handleSubmit} style={{
        background: '#fff',
        padding: 32,
        borderRadius: 8,
        boxShadow: '0 2px 16px #0001',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        minWidth: 320
      }}>
        <input
          type="text"
          placeholder="Login"
          value={login}
          onChange={e => setLogin(e.target.value)}
          style={{ padding: 8, fontSize: 16 }}
          disabled={loading}
        />
        <input
          type="password"
          placeholder="Senha"
          value={senha}
          onChange={e => setSenha(e.target.value)}
          style={{ padding: 8, fontSize: 16 }}
          disabled={loading}
        />
        {erro && <div style={{ color: 'red', textAlign: 'center' }}>{erro}</div>}
        <button type="submit" style={{
          padding: 10,
          fontSize: 16,
          background: '#222',
          color: '#fff',
          border: 'none',
          borderRadius: 4,
          cursor: loading ? 'not-allowed' : 'pointer',
          opacity: loading ? 0.7 : 1
        }} disabled={loading}>
          {loading ? 'Aguarde...' : isCadastro ? 'Cadastrar-se' : 'Entrar'}
        </button>
        <div style={{ textAlign: 'center', marginTop: 8 }}>
          {isCadastro ? (
            <span>
              Já tem uma conta?{' '}
              <a
                href="#"
                style={{ color: '#0070f3', cursor: 'pointer', textDecoration: 'underline' }}
                onClick={e => {
                  e.preventDefault();
                  setIsCadastro(false);
                  setErro('');
                }}
              >
                Faça login
              </a>
            </span>
          ) : (
            <span>
              Não tem uma conta?{' '}
              <a
                href="#"
                style={{ color: '#0070f3', cursor: 'pointer', textDecoration: 'underline' }}
                onClick={e => {
                  e.preventDefault();
                  setIsCadastro(true);
                  setErro('');
                }}
              >
                Faça o cadastro
              </a>
            </span>
          )}
        </div>
      </form>
    </div>
  );
}