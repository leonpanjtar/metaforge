import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

interface Account {
  _id: string;
  name: string;
  role: 'owner' | 'admin' | 'member';
  ownerId: string;
}

interface User {
  id: string;
  email: string;
  name: string;
  accounts?: Account[];
}

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [currentAccount, setCurrentAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      fetchUser();
    } else {
      setLoading(false);
    }
  }, []);

  // Set current account when user data loads
  useEffect(() => {
    if (user?.accounts) {
      const savedAccountId = localStorage.getItem('currentAccountId');
      if (savedAccountId) {
        const account = user.accounts.find(a => a._id === savedAccountId);
        if (account) {
          setCurrentAccount(account);
          return;
        }
      }
      // Auto-select first account if none selected
      if (user.accounts.length > 0) {
        setCurrentAccount(user.accounts[0]);
        localStorage.setItem('currentAccountId', user.accounts[0]._id);
      }
    }
  }, [user]);

  const fetchUser = async () => {
    try {
      const response = await api.get('/auth/me');
      const userData = response.data;
      setUser(userData);
      
      // Set current account
      const savedAccountId = localStorage.getItem('currentAccountId');
      if (savedAccountId && userData.accounts) {
        const account = userData.accounts.find((a: Account) => a._id === savedAccountId);
        if (account) {
          setCurrentAccount(account);
        } else if (userData.accounts.length > 0) {
          // If saved account not found, use first account
          setCurrentAccount(userData.accounts[0]);
          localStorage.setItem('currentAccountId', userData.accounts[0]._id);
        }
      } else if (userData.accounts && userData.accounts.length > 0) {
        // Auto-select first account
        setCurrentAccount(userData.accounts[0]);
        localStorage.setItem('currentAccountId', userData.accounts[0]._id);
      }
    } catch (error) {
      localStorage.removeItem('token');
      localStorage.removeItem('currentAccountId');
    } finally {
      setLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    const response = await api.post('/auth/login', { email, password });
    localStorage.setItem('token', response.data.token);
    setUser(response.data.user);
    return response.data;
  };

  const register = async (email: string, password: string, name: string) => {
    const response = await api.post('/auth/register', { email, password, name });
    localStorage.setItem('token', response.data.token);
    setUser(response.data.user);
    
    // Set default account if provided
    if (response.data.defaultAccountId) {
      localStorage.setItem('currentAccountId', response.data.defaultAccountId);
    }
    
    // Fetch full user data with accounts
    await fetchUser();
    return response.data;
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('currentAccountId');
    setUser(null);
    setCurrentAccount(null);
    navigate('/login');
  };

  const switchAccount = (account: Account) => {
    setCurrentAccount(account);
    localStorage.setItem('currentAccountId', account._id);
    // Refresh user data to get updated accounts
    fetchUser();
  };

  return { 
    user, 
    currentAccount, 
    loading, 
    login, 
    register, 
    logout, 
    switchAccount,
    refreshUser: fetchUser,
  };
};

