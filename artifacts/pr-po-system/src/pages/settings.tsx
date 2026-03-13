import { useState, useEffect } from "react";
import { useGetSettings, useUpdateSettings } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save } from "lucide-react";

export default function Settings() {
  const { data, isLoading } = useGetSettings();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [poEnabled, setPoEnabled] = useState(true);
  const [companyName, setCompanyName] = useState("");

  useEffect(() => {
    if (data) {
      setPoEnabled(data.poEnabled);
      setCompanyName(data.companyName);
    }
  }, [data]);

  const { mutate, isPending } = useUpdateSettings({
    mutation: {
      onSuccess: () => {
        toast({ title: "Berhasil", description: "Pengaturan sistem disimpan." });
        queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      }
    }
  });

  const handleSave = () => {
    mutate({ data: { poEnabled, companyName } });
  };

  if (isLoading) return <div className="p-8 text-center animate-pulse">Memuat pengaturan...</div>;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h2 className="text-2xl font-display font-bold text-foreground">Pengaturan Sistem</h2>
        <p className="text-sm text-muted-foreground">Konfigurasi alur kerja dan identitas perusahaan</p>
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Fitur & Modul</CardTitle>
          <CardDescription>Aktifkan atau nonaktifkan modul sistem sesuai kebutuhan perusahaan</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-row items-center justify-between rounded-xl border p-4 bg-slate-50/50">
            <div className="space-y-0.5">
              <Label className="text-base font-semibold">Purchase Order (PO) Feature</Label>
              <p className="text-sm text-muted-foreground">
                Jika diaktifkan, PR yang disetujui harus diubah menjadi PO oleh Purchasing. Jika non-aktif, PR langsung diterima oleh User.
              </p>
            </div>
            <Switch 
              checked={poEnabled}
              onCheckedChange={setPoEnabled}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Profil Perusahaan</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2 max-w-md">
            <Label>Nama Perusahaan</Label>
            <Input 
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="h-10"
            />
          </div>
          
          <Button onClick={handleSave} disabled={isPending} className="mt-4 shadow-md">
            {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Simpan Pengaturan
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
