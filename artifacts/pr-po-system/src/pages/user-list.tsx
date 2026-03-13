import { useState } from "react";
import { useGetUsers } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function UserList() {
  const [search, setSearch] = useState("");
  const { data, isLoading } = useGetUsers({ search: search || undefined, limit: 100 });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-display font-bold text-foreground">User Management</h2>
          <p className="text-sm text-muted-foreground">Kelola pengguna sistem dan hak akses</p>
        </div>
        <Button className="rounded-xl shadow-md">
          <Plus className="mr-2 h-4 w-4" /> Tambah User
        </Button>
      </div>

      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          <div className="p-4 border-b bg-slate-50/50 rounded-t-xl">
            <div className="relative w-full md:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Cari nama atau username..." 
                className="pl-9 h-10 bg-white"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="overflow-x-auto table-scrollbar">
            <Table>
              <TableHeader className="bg-slate-50/80">
                <TableRow>
                  <TableHead className="font-semibold text-slate-700">Nama Lengkap</TableHead>
                  <TableHead className="font-semibold text-slate-700">Username</TableHead>
                  <TableHead className="font-semibold text-slate-700">Departemen</TableHead>
                  <TableHead className="font-semibold text-slate-700">Jabatan</TableHead>
                  <TableHead className="font-semibold text-slate-700">Role</TableHead>
                  <TableHead className="font-semibold text-slate-700">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={6} className="text-center h-24 text-muted-foreground">Memuat data...</TableCell></TableRow>
                ) : data?.users?.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center h-24 text-muted-foreground">Tidak ada user ditemukan</TableCell></TableRow>
                ) : (
                  data?.users.map((user) => (
                    <TableRow key={user.id} className="hover:bg-slate-50">
                      <TableCell className="font-medium text-foreground">{user.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{user.username}</TableCell>
                      <TableCell className="text-sm">{user.department}</TableCell>
                      <TableCell className="text-sm">{user.position}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize border-slate-200 text-slate-700">
                          {user.role}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={user.isActive ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-none shadow-none" : "bg-slate-100 text-slate-600 hover:bg-slate-100 border-none shadow-none"}>
                          {user.isActive ? "Aktif" : "Non-Aktif"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
