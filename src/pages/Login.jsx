import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/api/apiClient';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const data = await api.auth.login({ username, password });
      localStorage.setItem('token', data.token);
      window.location.href = '/Dashboard';
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-green-950 via-green-700 to-yellow-200 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-linear-to-br from-yellow-500 to-green-700 rounded-xl flex items-center justify-center text-white text-2xl font-semibold mx-auto mb-4 shadow-md shadow-white-200">
            DS
          </div>
          <h1 className="text-2xl font-semibold text-stone-900">DASC EQ SECVICE</h1>
          <p className="text-stone-400 text-sm mt-1">Equation Anagram Training Platform</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2.5 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-transparent transition-shadow"
              placeholder="Enter your username"
              required
              autoComplete="username"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2.5 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-transparent transition-shadow"
              placeholder="Enter your password"
              required
              autoComplete="current-password"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl p-3">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-green-600 hover:bg-green-700 active:bg-green-800 text-white font-semibold py-2.5 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <p className="text-center text-xs text-stone-400 mt-6">
          Don't have an account?{' '}
          <Link to="/Register" className="text-green-700 font-medium hover:underline">
            Register here
          </Link>
        </p>
      </div>
    </div>
  );
}
