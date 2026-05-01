import { create } from 'zustand';

export interface CxUser {
  id: number;
  email: string;
  name: string;
  role: 'admin' | 'operador';
}

interface AuthState {
  token: string | null;
  user: CxUser | null;
  setSession: (token: string, user: CxUser) => void;
  clear: () => void;
}

export const useAuth = create<AuthState>((set) => ({
  token: localStorage.getItem('token'),
  user: JSON.parse(localStorage.getItem('user') || 'null'),
  setSession: (token, user) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    set({ token, user });
  },
  clear: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    set({ token: null, user: null });
  },
}));
