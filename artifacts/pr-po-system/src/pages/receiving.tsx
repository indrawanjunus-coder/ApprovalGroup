import { useGetReceivingList, useReceivePurchaseRequest, useGetSettings, useGetMe } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { formatIDR, formatDate } from "@/lib/utils";
import { PackageCheck, Building, FileText, Loader2 } from "lucide-react";
import { useLocation } from "wouter";
import { useState } from "react";

export default function Receiving() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [receivingId, setReceivingId] = useState<number | null>(null);

  const { data: receivingData, isLoading } = useGetReceivingList();
  const { data: settings } = useGetSettings();
  const { data: user } = useGetMe();

  const { mutate: receivePR, isPending: isReceiving } = useReceivePurchaseRequest({
    mutation: {
      onSuccess: () => {
        toast({ title: "Barang Diterima!", description: "PR telah ditandai sebagai selesai." });
        setReceivingId(null);
        queryClient.invalidateQueries({ queryKey: ["/api/receiving"] });
        queryClient.invalidateQueries({ queryKey: ["/api/purchase-requests"] });
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      },
      onError: (e: any) => toast({ variant: "destructive", title: "Gagal", description: e.response?.data?.message }),
    }
  });

  const items = receivingData?.items || [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-display font-bold text-foreground">Penerimaan Barang</h2>
        <p className="text-sm text-muted-foreground">
          {settings?.poEnabled
            ? "Daftar Purchase Order yang sudah diterbitkan dan siap diterima"
            : "Daftar Purchase Request yang sudah disetujui & vendor dipilih, siap diterima"}
        </p>
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-muted-foreground animate-pulse">Memuat...</div>
      ) : items.length === 0 ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="py-16 text-center">
            <PackageCheck className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="font-medium text-muted-foreground">Tidak ada barang yang perlu diterima saat ini.</p>
            <p className="text-sm text-muted-foreground mt-1">
              {settings?.poEnabled
                ? "Barang akan muncul di sini setelah PO diterbitkan."
                : "Barang akan muncul di sini setelah PR disetujui dan vendor dipilih."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {items.map((item: any) => (
            <Card key={`${item.type}-${item.id}`} className="border-0 shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="h-9 w-9 rounded-xl bg-teal-100 flex items-center justify-center">
                      <PackageCheck className="h-5 w-5 text-teal-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">{item.prNumber}</p>
                      {item.poNumber && (
                        <p className="text-xs text-muted-foreground">PO: {item.poNumber}</p>
                      )}
                    </div>
                  </div>
                  <Badge className={`text-xs border-none shadow-none ${item.type === "po" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>
                    {item.type === "po" ? "Via PO" : "Direct"}
                  </Badge>
                </div>

                <p className="text-sm font-medium text-foreground line-clamp-2 mb-3">{item.prDescription}</p>

                <div className="space-y-1.5 text-sm text-muted-foreground mb-4">
                  <div className="flex items-center gap-2">
                    <FileText className="h-3.5 w-3.5" />
                    <span>Pemohon: <strong className="text-foreground">{item.requesterName}</strong></span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Building className="h-3.5 w-3.5" />
                    <span>{item.department}</span>
                  </div>
                  {item.vendorName && (
                    <div className="flex items-center gap-2 text-emerald-700">
                      <PackageCheck className="h-3.5 w-3.5" />
                      <span>Vendor: <strong>{item.vendorName}</strong></span>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between border-t pt-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Nilai</p>
                    <p className="font-bold text-primary">{formatIDR(item.totalAmount)}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="h-8 text-xs"
                      onClick={() => setLocation(`/purchase-requests/${item.prId}`)}>
                      Detail
                    </Button>
                    {/* Only requester can confirm receipt */}
                    {item.type === "pr" && (
                      <Button size="sm" className="h-8 text-xs bg-teal-600 hover:bg-teal-700"
                        disabled={isReceiving && receivingId === item.prId}
                        onClick={() => {
                          setReceivingId(item.prId);
                          receivePR({ id: item.prId, data: { notes: "" } });
                        }}>
                        {isReceiving && receivingId === item.prId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PackageCheck className="h-3.5 w-3.5" />}
                        <span className="ml-1">Terima</span>
                      </Button>
                    )}
                    {item.type === "po" && (
                      <Button size="sm" variant="outline" className="h-8 text-xs"
                        onClick={() => setLocation(`/purchase-orders/${item.poId}`)}>
                        Lihat PO
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
