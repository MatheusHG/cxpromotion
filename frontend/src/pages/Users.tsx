import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/store/auth';
import { fmtDate } from '@/lib/utils';

interface CxUser {
  id: number;
  email: string;
  name: string;
  role: 'admin' | 'operador';
  active: boolean;
  created_at: string;
}

export function Users() {
  const qc = useQueryClient();
  const me = useAuth((s) => s.user);
  const [editing, setEditing] = useState<CxUser | null>(null);
  const [creating, setCreating] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['cx-users'],
    queryFn: async () => (await api.get<CxUser[]>('/users')).data,
  });

  const delMut = useMutation({
    mutationFn: async (id: number) => api.delete(`/users/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cx-users'] });
      toast.success('Atendente removido');
    },
    onError: (e: any) => toast.error(e?.response?.data?.error ?? 'Erro ao remover'),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Atendentes</h1>
          <p className="text-sm text-muted-foreground">Gerencie quem tem acesso ao sistema</p>
        </div>
        <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Novo atendente</Button>
      </div>

      <Card>
        <CardHeader><CardTitle>Lista</CardTitle></CardHeader>
        <CardContent>
          {isLoading && <div className="text-sm text-muted-foreground">Carregando…</div>}
          {data && (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Criado em</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell>{u.name}</TableCell>
                      <TableCell>{u.email}</TableCell>
                      <TableCell>{u.role}</TableCell>
                      <TableCell>{u.active ? 'Ativo' : 'Inativo'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{fmtDate(u.created_at)}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => setEditing(u)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {u.id !== me?.id && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              if (confirm(`Remover ${u.email}?`)) delMut.mutate(u.id);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {creating && <UserDialog mode="create" onClose={() => setCreating(false)} />}
      {editing && <UserDialog mode="edit" initial={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

interface UserDialogProps {
  mode: 'create' | 'edit';
  initial?: CxUser;
  onClose: () => void;
}

function UserDialog({ mode, initial, onClose }: UserDialogProps) {
  const qc = useQueryClient();
  const [name, setName] = useState(initial?.name ?? '');
  const [email, setEmail] = useState(initial?.email ?? '');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'admin' | 'operador'>(initial?.role ?? 'operador');
  const [active, setActive] = useState(initial?.active ?? true);

  const mut = useMutation({
    mutationFn: async () => {
      if (mode === 'create') {
        return api.post('/users', { email, name, password, role });
      } else {
        const body: any = { email, name, role, active };
        if (password) body.password = password;
        return api.put(`/users/${initial!.id}`, body);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cx-users'] });
      toast.success(mode === 'create' ? 'Atendente criado' : 'Atendente atualizado');
      onClose();
    },
    onError: (e: any) => toast.error(e?.response?.data?.error ?? 'Erro'),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Novo atendente' : 'Editar atendente'}</DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? 'Defina email, nome, senha e papel.'
              : 'Atualize os dados. Deixe a senha em branco para mantê-la.'}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => { e.preventDefault(); mut.mutate(); }}
          className="space-y-4"
        >
          <div className="space-y-1">
            <Label htmlFor="name">Nome</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="password">{mode === 'edit' ? 'Nova senha (opcional)' : 'Senha'}</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required={mode === 'create'}
              minLength={mode === 'create' ? 6 : undefined}
            />
          </div>
          <div className="space-y-1">
            <Label>Papel</Label>
            <Select value={role} onValueChange={(v) => setRole(v as 'admin' | 'operador')}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="operador">Operador</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {mode === 'edit' && (
            <div className="space-y-1">
              <Label>Status</Label>
              <Select value={active ? 'true' : 'false'} onValueChange={(v) => setActive(v === 'true')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Ativo</SelectItem>
                  <SelectItem value="false">Inativo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={mut.isPending}>
              {mut.isPending ? 'Salvando…' : 'Salvar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
