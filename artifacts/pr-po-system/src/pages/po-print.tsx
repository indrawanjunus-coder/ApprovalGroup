import { useEffect, useRef, useState } from "react";
import { useParams } from "wouter";
import { useGetPurchaseOrderById, useGetSettings } from "@workspace/api-client-react";
import { formatIDR } from "@/lib/utils";

export default function POPrint() {
  const { id } = useParams<{ id: string }>();
  const poId = Number(id);

  const { data: po, isLoading: poLoading } = useGetPurchaseOrderById(poId);
  const { data: settings, isLoading: settingsLoading } = useGetSettings();

  const isReady = !poLoading && !settingsLoading && !!po;
  const docRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "generating" | "done" | "error">("loading");

  useEffect(() => {
    if (!isReady) return;
    if (status !== "loading") return;

    const generate = async () => {
      setStatus("generating");
      try {
        await new Promise((r) => setTimeout(r, 800));

        const el = docRef.current;
        if (!el) throw new Error("Element not found");

        const [html2canvasModule, jsPDFModule] = await Promise.all([
          import("html2canvas"),
          import("jspdf"),
        ]);
        const html2canvas = html2canvasModule.default;
        const jsPDF = jsPDFModule.default;

        const canvas = await html2canvas(el, {
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: "#ffffff",
        });

        const imgData = canvas.toDataURL("image/png");
        const pdf = new jsPDF("p", "mm", "a4");
        const pageWidth = 210;
        const pageHeight = 297;
        const imgWidth = pageWidth;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;

        let heightLeft = imgHeight;
        let position = 0;

        pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;

        while (heightLeft > 0) {
          position = heightLeft - imgHeight;
          pdf.addPage();
          pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
          heightLeft -= pageHeight;
        }

        pdf.save(`PO-${(po as any).poNumber}.pdf`);
        setStatus("done");
      } catch (e) {
        console.error(e);
        setStatus("error");
      }
    };

    generate();
  }, [isReady]);

  if (!isReady || status === "loading") {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "Arial, sans-serif", fontSize: 14, color: "#666", gap: 12 }}>
        <div style={{ width: 40, height: 40, border: "3px solid #e2e8f0", borderTop: "3px solid #7e22ce", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
        <span>Memuat dokumen PO...</span>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (status === "generating") {
    return (
      <>
        <div ref={docRef} style={{ position: "absolute", left: "-9999px", top: 0, width: "794px", background: "#fff" }}>
          <PODocument po={po} settings={settings} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "Arial, sans-serif", fontSize: 14, color: "#666", gap: 12 }}>
          <div style={{ width: 40, height: 40, border: "3px solid #e2e8f0", borderTop: "3px solid #7e22ce", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
          <span>Membuat PDF, harap tunggu...</span>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </>
    );
  }

  if (status === "error") {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "Arial, sans-serif", fontSize: 14, color: "#dc2626", gap: 12 }}>
        <span>Gagal membuat PDF. Silakan coba lagi.</span>
        <button onClick={() => setStatus("loading")} style={{ padding: "8px 16px", background: "#7e22ce", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 14 }}>
          Coba Lagi
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "Arial, sans-serif", gap: 12 }}>
      <div style={{ fontSize: 48 }}>✅</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: "#15803d" }}>PDF Berhasil Diunduh</div>
      <div style={{ fontSize: 13, color: "#555" }}>
        File <strong>PO-{(po as any).poNumber}.pdf</strong> tersimpan di folder unduhan Anda.
      </div>
      <button onClick={() => window.close()} style={{ marginTop: 8, padding: "8px 20px", background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 6, cursor: "pointer", fontSize: 14, color: "#374151" }}>
        Tutup Tab
      </button>
    </div>
  );
}

// ─── PO Document Layout ──────────────────────────────────────────────────────

function PODocument({ po, settings }: { po: any; settings: any }) {
  return (
    <div style={{ fontFamily: "Arial, sans-serif", color: "#111", fontSize: 9, lineHeight: 1.3, padding: "10mm", background: "#fff" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "2px solid #7e22ce", paddingBottom: 6, marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {settings?.logoUrl && <img src={settings.logoUrl} alt="Logo" style={{ height: 36, objectFit: "contain" }} />}
          <div>
            <div style={{ fontWeight: 700, fontSize: 12 }}>{settings?.companyName || settings?.appName || "ProcureFlow"}</div>
            {settings?.companyAddress && <div style={{ fontSize: 8, color: "#666" }}>{settings.companyAddress}</div>}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 14, fontWeight: 800 }}>PURCHASE ORDER</div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#7e22ce" }}>{po.poNumber}</div>
          <div style={{ fontSize: 8, color: "#666" }}>Dicetak: {new Date().toLocaleDateString("id-ID")} &nbsp;|&nbsp;
            <span style={{ fontWeight: 700, color: po.status === "issued" ? "#15803d" : "#92400e" }}>
              {po.status?.toUpperCase() || "DRAFT"}
            </span>
          </div>
        </div>
      </div>

      {/* Info Grid */}
      <table style={{ width: "100%", fontSize: 9, marginBottom: 6, borderCollapse: "collapse" }}>
        <tbody>
          {po.pr?.companyName && (
            <tr>
              <td style={{ width: "12%", color: "#666", paddingBottom: 2 }}>Perusahaan</td>
              <td colSpan={3} style={{ fontWeight: 700, paddingBottom: 2, color: "#7e22ce" }}>{po.pr.companyName}</td>
            </tr>
          )}
          <tr>
            <td style={{ width: "12%", color: "#666", paddingBottom: 2 }}>Nomor PO</td>
            <td style={{ width: "38%", fontWeight: 700, paddingBottom: 2 }}>{po.poNumber}</td>
            <td style={{ width: "12%", color: "#666", paddingBottom: 2 }}>Ref. PR</td>
            <td style={{ width: "38%", paddingBottom: 2 }}>{po.prNumber}</td>
          </tr>
          <tr>
            <td style={{ color: "#666", paddingBottom: 2 }}>Supplier</td>
            <td style={{ fontWeight: 700, color: "#7e22ce", paddingBottom: 2 }}>{po.supplier}</td>
            <td style={{ color: "#666", paddingBottom: 2 }}>Dibuat Oleh</td>
            <td style={{ paddingBottom: 2 }}>{po.createdByName} — {new Date(po.createdAt).toLocaleDateString("id-ID")}</td>
          </tr>
          {po.pr?.department && (
            <tr>
              <td style={{ color: "#666", paddingBottom: 2 }}>Departemen</td>
              <td style={{ paddingBottom: 2 }}>{po.pr.department}</td>
              <td style={{ color: "#666", paddingBottom: 2 }}>Pemohon PR</td>
              <td style={{ paddingBottom: 2 }}>{po.pr.requesterName}</td>
            </tr>
          )}
          {(po.pr?.description || po.pr?.notes) && (
            <tr>
              <td style={{ color: "#666", paddingBottom: 2 }}>Keperluan</td>
              <td colSpan={3} style={{ paddingBottom: 2 }}>{po.pr.description}{po.pr.notes ? ` — ${po.pr.notes}` : ""}</td>
            </tr>
          )}
          {po.notes && (
            <tr>
              <td style={{ color: "#666", paddingBottom: 2 }}>Catatan PO</td>
              <td colSpan={3} style={{ paddingBottom: 2 }}>{po.notes}</td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Items Table */}
      <div style={{ marginBottom: 6 }}>
        <div style={{ fontWeight: 700, fontSize: 9, borderBottom: "1.5px solid #7e22ce", color: "#7e22ce", paddingBottom: 2, marginBottom: 2 }}>DAFTAR ITEM</div>
        <table style={{ width: "100%", fontSize: 9, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f3e8ff" }}>
              <th style={{ padding: "2px 4px", border: "1px solid #e9d5ff", textAlign: "center" }}>No</th>
              <th style={{ padding: "2px 4px", border: "1px solid #e9d5ff", textAlign: "left" }}>NAMA BARANG</th>
              <th style={{ padding: "2px 4px", border: "1px solid #e9d5ff", textAlign: "right" }}>QTY</th>
              <th style={{ padding: "2px 4px", border: "1px solid #e9d5ff", textAlign: "center" }}>SAT</th>
              <th style={{ padding: "2px 4px", border: "1px solid #e9d5ff", textAlign: "right" }}>HARGA FINAL</th>
              <th style={{ padding: "2px 4px", border: "1px solid #e9d5ff", textAlign: "right" }}>TOTAL</th>
            </tr>
          </thead>
          <tbody>
            {po.items.map((item: any, i: number) => (
              <tr key={item.id} style={{ background: i % 2 === 1 ? "#faf5ff" : undefined }}>
                <td style={{ padding: "2px 4px", border: "1px solid #e2e8f0", textAlign: "center" }}>{i + 1}</td>
                <td style={{ padding: "2px 4px", border: "1px solid #e2e8f0", fontWeight: 600, textTransform: "uppercase" }}>{item.name}</td>
                <td style={{ padding: "2px 4px", border: "1px solid #e2e8f0", textAlign: "right" }}>{item.quantity}</td>
                <td style={{ padding: "2px 4px", border: "1px solid #e2e8f0", textAlign: "center" }}>{item.unit}</td>
                <td style={{ padding: "2px 4px", border: "1px solid #e2e8f0", textAlign: "right" }}>{formatIDR(item.finalPrice)}</td>
                <td style={{ padding: "2px 4px", border: "1px solid #e2e8f0", textAlign: "right", fontWeight: 600 }}>{formatIDR(item.quantity * item.finalPrice)}</td>
              </tr>
            ))}
            <tr style={{ fontWeight: 700 }}>
              <td colSpan={5} style={{ padding: "2px 4px", border: "1px solid #e2e8f0", textAlign: "right", background: "#f1f5f9" }}>TOTAL</td>
              <td style={{ padding: "2px 4px", border: "1px solid #e2e8f0", textAlign: "right", color: "#7e22ce", background: "#f1f5f9" }}>{formatIDR(po.totalAmount)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Approval Chain */}
      {po.approvals?.length > 0 && (
        <div style={{ marginBottom: 6 }}>
          <div style={{ fontWeight: 700, fontSize: 9, borderBottom: "1.5px solid #4c1d95", color: "#4c1d95", paddingBottom: 2, marginBottom: 2 }}>ALUR PERSETUJUAN PR</div>
          <table style={{ width: "100%", fontSize: 9, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f5f3ff" }}>
                <th style={{ padding: "2px 4px", border: "1px solid #e2e8f0", textAlign: "center" }}>Level</th>
                <th style={{ padding: "2px 4px", border: "1px solid #e2e8f0", textAlign: "left" }}>Approver</th>
                <th style={{ padding: "2px 4px", border: "1px solid #e2e8f0", textAlign: "center" }}>Status</th>
                <th style={{ padding: "2px 4px", border: "1px solid #e2e8f0", textAlign: "center" }}>Tanggal</th>
                <th style={{ padding: "2px 4px", border: "1px solid #e2e8f0", textAlign: "left" }}>Catatan</th>
                <th style={{ padding: "2px 4px", border: "1px solid #e2e8f0", textAlign: "center", width: "15%" }}>Tanda Tangan</th>
              </tr>
            </thead>
            <tbody>
              {po.approvals.map((app: any) => (
                <tr key={app.id}>
                  <td style={{ padding: "2px 4px", border: "1px solid #e2e8f0", textAlign: "center" }}>{app.level === 0 ? "Atasan" : `L${app.level}`}</td>
                  <td style={{ padding: "2px 4px", border: "1px solid #e2e8f0", fontWeight: 600 }}>{app.approverName}</td>
                  <td style={{ padding: "2px 4px", border: "1px solid #e2e8f0", textAlign: "center", fontWeight: 700, color: app.status === "approved" ? "#15803d" : app.status === "rejected" ? "#dc2626" : "#888" }}>
                    {app.status === "approved" ? "Disetujui" : app.status === "rejected" ? "Ditolak" : "Menunggu"}
                  </td>
                  <td style={{ padding: "2px 4px", border: "1px solid #e2e8f0", textAlign: "center", color: "#555" }}>{app.actionAt ? new Date(app.actionAt).toLocaleDateString("id-ID") : "—"}</td>
                  <td style={{ padding: "2px 4px", border: "1px solid #e2e8f0", color: "#555" }}>{app.notes || "—"}</td>
                  <td style={{ padding: "2px 4px", border: "1px solid #e2e8f0", height: 28, textAlign: "center" }}>
                    {app.status === "approved" && app.approverSignature
                      ? <img src={app.approverSignature} alt="ttd" style={{ maxHeight: 24, maxWidth: 80, objectFit: "contain" }} />
                      : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Signature Section */}
      <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
        {["Dibuat Oleh", "Disetujui Oleh", "Diterima Supplier"].map((label) => (
          <div key={label} style={{ flex: 1, textAlign: "center", border: "1px solid #e2e8f0", padding: "4px 6px" }}>
            <div style={{ fontSize: 8, color: "#555", marginBottom: 32, fontWeight: 600 }}>{label}</div>
            <div style={{ borderTop: "1px solid #555", paddingTop: 3, fontSize: 8, color: "#555" }}>Nama & Tanda Tangan</div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{ borderTop: "1px solid #ddd", paddingTop: 4, marginTop: 4, fontSize: 8, color: "#999", display: "flex", justifyContent: "space-between" }}>
        <span>{settings?.appName || "ProcureFlow"} — digenerate otomatis</span>
        <span>{po.poNumber} | {new Date().toLocaleString("id-ID")}</span>
      </div>
    </div>
  );
}
