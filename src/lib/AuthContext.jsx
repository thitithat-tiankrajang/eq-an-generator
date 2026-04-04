import React, { createContext, useState, useContext, useEffect } from 'react';
import { api } from '@/api/apiClient';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings] = useState(false);
  const [authError, setAuthError] = useState(null);

  useEffect(() => {
    const init = async () => {
      const token = localStorage.getItem('token');
      if (!token) {
        setIsLoadingAuth(false);
        setAuthError({ type: 'auth_required', message: 'Please log in' });
        return;
      }

      try {
        const data = await api.auth.getProfile();
        const u = data.user;
        const fullName = [u.firstName, u.lastName].filter(Boolean).join(' ') || u.username;
        setUser({
          id: u.id,
          email: u.username,
          full_name: fullName,
          role: u.role === 'admin' ? 'admin' : 'student',
          rawUser: u,
        });
        setIsAuthenticated(true);
      } catch (error) {
        localStorage.removeItem('token');
        setAuthError({ type: 'auth_required', message: 'Session expired. Please log in again.' });
        throw(error);
      } finally {
        setIsLoadingAuth(false);
      }
    };

    init();
  }, []);

  const logout = () => {
    api.auth.logout().catch(() => {});
    localStorage.removeItem('token');
    setUser(null);
    setIsAuthenticated(false);
    if (typeof window !== 'undefined') {
      window.location.href = '/Login';
    }
  };

  const navigateToLogin = () => {
    if (typeof window !== 'undefined') {
      window.location.href = '/Login';
    }
  };

  const checkAppState = async () => {
    // No-op: no remote app settings in this backend
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        isLoadingAuth,
        isLoadingPublicSettings,
        authError,
        appPublicSettings: null,
        logout,
        navigateToLogin,
        checkAppState,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
