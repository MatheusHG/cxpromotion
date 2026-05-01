import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Search, Users, LogOut } from 'lucide-react';
import { useAuth } from '@/store/auth';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function Layout() {
  const { user, clear } = useAuth();
  const navigate = useNavigate();

  const linkCls = ({ isActive }: { isActive: boolean }) =>
    cn(
      'flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent',
      isActive && 'bg-accent font-medium',
    );

  return (
    <div className="flex min-h-screen">
      <aside className="w-64 border-r bg-muted/40 p-4 flex flex-col">
        <div className="mb-6">
          <h1 className="text-lg font-semibold">CX Promoções</h1>
          <p className="text-xs text-muted-foreground">{user?.name} · {user?.role}</p>
        </div>
        <nav className="flex-1 space-y-1">
          <NavLink to="/dashboard" className={linkCls}><LayoutDashboard className="h-4 w-4" /> Dashboard</NavLink>
          <NavLink to="/user-search" className={linkCls}><Search className="h-4 w-4" /> Buscar usuário</NavLink>
          {user?.role === 'admin' && (
            <NavLink to="/users" className={linkCls}><Users className="h-4 w-4" /> Atendentes</NavLink>
          )}
        </nav>
        <Button
          variant="ghost"
          className="justify-start"
          onClick={() => { clear(); navigate('/login'); }}
        >
          <LogOut className="h-4 w-4" /> Sair
        </Button>
      </aside>
      <main className="flex-1 p-6">
        <Outlet />
      </main>
    </div>
  );
}
