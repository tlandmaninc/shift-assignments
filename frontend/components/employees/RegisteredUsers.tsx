'use client';

import { useState, useEffect } from 'react';
import { Shield } from 'lucide-react';
import { Card, CardHeader, Button, Badge } from '@/components/ui';
import { employeesApi } from '@/lib/api';
import toast from 'react-hot-toast';

interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
  employee_id: number | null;
  last_login: string | null;
}

export function RegisteredUsers() {
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const data = await employeesApi.listUsers();
      setUsers(data);
    } catch {
      // Silently fail — section just won't show data
    } finally {
      setLoading(false);
    }
  };

  const handleToggleAdmin = async (userId: string, makeAdmin: boolean) => {
    const u = users.find((x) => x.id === userId);
    const action = makeAdmin ? 'grant admin access to' : 'remove admin access from';
    if (!confirm(`Are you sure you want to ${action} ${u?.name}?`)) return;

    try {
      const result = await employeesApi.toggleUserAdmin(userId, makeAdmin);
      setUsers(users.map((x) => (x.id === userId ? { ...x, role: result.new_role } : x)));
      toast.success(`${u?.name} is now ${result.new_role}`);
    } catch (error: any) {
      toast.error(error.message || 'Failed to update admin status');
    }
  };

  if (loading || users.length === 0) return null;

  return (
    <Card>
      <CardHeader
        title={`Registered Users (${users.length})`}
        description="User accounts that have logged into the system"
      />
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-700">
              {['Name', 'Email', 'Role'].map((h) => (
                <th key={h} className="text-left py-3 px-4 text-sm font-medium text-slate-500">
                  {h}
                </th>
              ))}
              <th className="text-right py-3 px-4 text-sm font-medium text-slate-500">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr
                key={u.id}
                className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50"
              >
                <td className="py-3 px-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center text-white font-medium text-sm">
                      {u.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="font-medium text-slate-900 dark:text-white">{u.name}</span>
                  </div>
                </td>
                <td className="py-3 px-4 text-sm text-slate-500">{u.email}</td>
                <td className="py-3 px-4">
                  <Badge variant={u.role === 'admin' ? 'warning' : 'default'}>
                    {u.role === 'admin' ? 'Admin' : u.role === 'employee' ? 'Employee' : 'Basic'}
                  </Badge>
                </td>
                <td className="py-3 px-4">
                  <div className="flex items-center justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleToggleAdmin(u.id, u.role !== 'admin')}
                      title={u.role === 'admin' ? 'Remove admin access' : 'Grant admin access'}
                    >
                      <Shield className={`w-4 h-4 ${u.role === 'admin' ? 'text-amber-500' : ''}`} />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
