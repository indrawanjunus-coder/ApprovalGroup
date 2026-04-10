import { useEffect, useRef, useState } from "react";
import { useParams, useSearch } from "wouter";
import { useGetPurchaseRequestById, useGetSettings } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { formatIDR, formatDate } from "@/lib/utils";

export default function PRPrint() {
  const { id } = useParams<{ id: string }>();
  const prId = Number(id);
  const search = useSearch();
  const params = new URLSearchParams(search);
  const mode = params.get("mode") || "pr";

  const { data: pr, isLoading: prLoading } = useGetPurchaseRequestById(prId);
  const { data: settings, isLoading: settingsLoading } = useGetSettings();
  const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

  const { data: prTypesData } = useQuery<any[]>({
    queryKey: ["/api/pr-types"],
    queryFn: async () => {
      const res = await fetch(`${BASE_URL}/api/pr-types`, { credentials: "include" });
      return res.ok ? res.json() : [];
    },
  });

  const getTypeLabel = (typeCode: string) => {
    const custom = (prTypesData || []).find((t: any) => t.code === typeCode);
    if (custom) return custom.label;
    const builtins: Record<string, string> = { purchase: "Pembelian", repair: "Perbaikan", leave: "Cuti" };
    return builtins[typeCode] || typeCode;
  };

  const isReady = !prLoading && !settingsLoading && !!pr;
  const docRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "generating" | "done" | "error">("loading");

  useEffect(() => {
    if (!isReady) return;
    if (status !== "loading") return;

    const generate = async () => {
      setStatus("generating");
      try {
        // Wait for images to load
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

        const filename = mode === "receiving"
          ? `BPB-${(pr as any).prNumber}.pdf`
          : `PR-${(pr as any).prNumber}.pdf`;
        pdf.save(filename);
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
        <div style={{ width: 40, height: 40, border: "3px solid #e2e8f0", borderTop: "3px solid #1a56db", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
        <span>Memuat dokumen...</span>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (status === "generating") {
    return (
      <>
        {/* Hidden document for capture */}
        <div ref={docRef} style={{ position: "absolute", left: "-9999px", top: 0, width: "794px", background: "#fff" }}>
          <DocumentContent pr={pr} settings={settings} mode={mode} getTypeLabel={getTypeLabel} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "Arial, sans-serif", fontSize: 14, color: "#666", gap: 12 }}>
          <div style={{ width: 40, height: 40, border: "3px solid #e2e8f0", borderTop: "3px solid #1a56db", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
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
        <button onClick={() => setStatus("loading")} style={{ padding: "8px 16px", background: "#1a56db", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 14 }}>
          Coba Lagi
        </button>
      </div>
    );
  }

  // done
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "Arial, sans-serif", gap: 12 }}>
      <div style={{ fontSize: 48 }}>✅</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: "#15803d" }}>PDF Berhasil Diunduh</div>
      <div style={{ fontSize: 13, color: "#555" }}>
        File <strong>{mode === "receiving" ? `BPB-${(pr as any).prNumber}.pdf` : `PR-${(pr as any).prNumber}.pdf`}</strong> tersimpan di folder unduhan Anda.
      </div>
      <button onClick={() => window.close()} style={{ marginTop: 8, padding: "8px 20px", background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 6, cursor: "pointer", fontSize: 14, color: "#374151" }}>
        Tutup Tab
      </button>
    </div>
  );
}

// ─── Document Content ────────────────────────────────────────────────────────

function DocumentContent({ pr, settings, mode, getTypeLabel }: {
  pr: any; settings: any; mode: string; getTypeLabel: (c: string) => string;
}) {
  if (mode === "receiving") {
    return (
      <div style={{ fontFamily: "Arial, sans-serif", color: "#111", fontSize: 10, lineHeight: 1.35, padding: "10mm", background: "#fff" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "2.5px solid #0d9488", paddingBottom: 8, marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {settings?.logoUrl && <img src={settings.logoUrl} alt="Logo" style={{ height: 44, objectFit: "contain" }} />}
            <div>
              {settings?.companyAddress && <div style={{ fontSize: 9, color: "#555" }}>{settings.companyAddress}</div>}
              {(settings as any)?.companyPhone && <div style={{ fontSize: 9, color: "#555" }}>Telp: {(settings as any).companyPhone}</div>}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: 1 }}>BUKTI PENERIMAAN BARANG</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#0d9488" }}>Ref: {pr.prNumber}</div>
            <div style={{ fontSize: 9, color: "#666" }}>Dicetak: {new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" })}</div>
            <div style={{ display: "inline-block", marginTop: 3, padding: "2px 8px", background: pr.receivingStatus === "closed" ? "#dcfce7" : "#fef3c7", color: pr.receivingStatus === "closed" ? "#15803d" : "#92400e", borderRadius: 4, fontWeight: 700, fontSize: 9 }}>
              STATUS: {pr.receivingStatus === "closed" ? "SELESAI" : pr.receivingStatus === "partial" ? "PARSIAL" : "PENDING"}
            </div>
          </div>
        </div>

        {/* PR Info */}
        <table style={{ width: "100%", fontSize: 10, marginBottom: 8, borderCollapse: "collapse" }}>
          <tbody>
            <tr>
              <td style={{ width: "13%", color: "#666", paddingBottom: 3 }}>Nomor PR</td>
              <td style={{ width: "37%", fontWeight: 600, paddingBottom: 3 }}>{pr.prNumber}</td>
              <td style={{ width: "13%", color: "#666", paddingBottom: 3 }}>Pemohon</td>
              <td style={{ width: "37%", fontWeight: 600, paddingBottom: 3 }}>{pr.requesterName}</td>
            </tr>
            <tr>
              <td style={{ color: "#666", paddingBottom: 3 }}>Deskripsi</td>
              <td colSpan={3} style={{ paddingBottom: 3 }}>{pr.description}</td>
            </tr>
            <tr>
              <td style={{ color: "#666", paddingBottom: 3 }}>Departemen</td>
              <td style={{ paddingBottom: 3 }}>{pr.department}</td>
              {pr.vendorName && <>
                <td style={{ color: "#666", paddingBottom: 3 }}>Vendor</td>
                <td style={{ paddingBottom: 3, fontWeight: 600 }}>{pr.vendorName}</td>
              </>}
            </tr>
          </tbody>
        </table>

        {/* Items */}
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontWeight: 700, fontSize: 10, background: "#0d9488", color: "#fff", padding: "3px 8px" }}>DETAIL BARANG & PENERIMAAN</div>
          <table style={{ width: "100%", fontSize: 10, borderCollapse: "collapse" }}>
            <colgroup>
              <col style={{ width: "5%" }} />
              <col style={{ width: "37%" }} />
              <col style={{ width: "8%" }} />
              <col style={{ width: "11%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "17%" }} />
            </colgroup>
            <thead>
              <tr style={{ background: "#ccfbf1" }}>
                <th style={{ textAlign: "center", padding: "5px 6px", border: "1px solid #99f6e4" }}>No</th>
                <th style={{ textAlign: "left", padding: "5px 6px", border: "1px solid #99f6e4" }}>NAMA BARANG</th>
                <th style={{ textAlign: "center", padding: "5px 6px", border: "1px solid #99f6e4" }}>SAT</th>
                <th style={{ textAlign: "right", padding: "5px 6px", border: "1px solid #99f6e4" }}>QTY ORDER</th>
                <th style={{ textAlign: "right", padding: "5px 6px", border: "1px solid #99f6e4" }}>QTY DITERIMA</th>
                <th style={{ textAlign: "right", padding: "5px 6px", border: "1px solid #99f6e4" }}>SISA</th>
                <th style={{ textAlign: "center", padding: "5px 6px", border: "1px solid #99f6e4" }}>STATUS</th>
              </tr>
            </thead>
            <tbody>
              {pr.items.map((item: any, idx: number) => {
                const received = ((pr as any).receivingRecords || [])
                  .filter((r: any) => r.prItemId === item.id)
                  .reduce((sum: number, r: any) => sum + r.receivedQty, 0);
                const isDone = received >= item.qty;
                const remaining = Math.max(0, item.qty - received);
                return (
                  <tr key={item.id} style={{ background: isDone ? "#f0fdf4" : idx % 2 === 1 ? "#f8fffe" : undefined }}>
                    <td style={{ padding: "4px 6px", border: "1px solid #e2e8f0", textAlign: "center" }}>{idx + 1}</td>
                    <td style={{ padding: "4px 6px", border: "1px solid #e2e8f0", fontWeight: 600, textTransform: "uppercase" }}>{item.name}</td>
                    <td style={{ padding: "4px 6px", border: "1px solid #e2e8f0", textAlign: "center" }}>{item.unit}</td>
                    <td style={{ padding: "4px 6px", border: "1px solid #e2e8f0", textAlign: "right" }}>{item.qty}</td>
                    <td style={{ padding: "4px 6px", border: "1px solid #e2e8f0", textAlign: "right", fontWeight: 700, color: isDone ? "#15803d" : received > 0 ? "#d97706" : "#555" }}>{received}</td>
                    <td style={{ padding: "4px 6px", border: "1px solid #e2e8f0", textAlign: "right", color: remaining > 0 ? "#dc2626" : "#15803d" }}>{remaining}</td>
                    <td style={{ padding: "4px 6px", border: "1px solid #e2e8f0", textAlign: "center", fontWeight: 600, color: isDone ? "#15803d" : received > 0 ? "#d97706" : "#555" }}>
                      {isDone ? "LENGKAP" : received > 0 ? "SEBAGIAN" : "BELUM"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div style={{ borderTop: "1px solid #ddd", paddingTop: 4, marginTop: 8, fontSize: 8, color: "#999", display: "flex", justifyContent: "space-between" }}>
          <span>{settings?.appName || "ProcureFlow"} — digenerate otomatis</span>
          <span>{pr.prNumber} | {new Date().toLocaleString("id-ID")}</span>
        </div>
      </div>
    );
  }

  // PR mode
  return (
    <div style={{ fontFamily: "Arial, sans-serif", color: "#111", fontSize: 9, lineHeight: 1.3, padding: "10mm", background: "#fff" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "2px solid #1a56db", paddingBottom: 6, marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {settings?.logoUrl && <img src={settings.logoUrl} alt="Logo" style={{ height: 36, objectFit: "contain" }} />}
          <div>
            {settings?.companyAddress && <div style={{ fontSize: 8, color: "#666" }}>{settings.companyAddress}</div>}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 14, fontWeight: 800 }}>PURCHASE REQUEST</div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#1a56db" }}>{pr.prNumber}</div>
          <div style={{ fontSize: 8, color: "#666" }}>Dicetak: {new Date().toLocaleDateString("id-ID")} &nbsp;|&nbsp;
            <span style={{ fontWeight: 700, color: pr.status === "approved" ? "#15803d" : pr.status === "rejected" ? "#dc2626" : "#92400e" }}>
              {pr.status.replace(/_/g, " ").toUpperCase()}
            </span>
          </div>
        </div>
      </div>

      {/* Info Grid */}
      <table style={{ width: "100%", fontSize: 9, marginBottom: 6, borderCollapse: "collapse" }}>
        <tbody>
          {pr.companyName && (
            <tr>
              <td style={{ width: "12%", color: "#666", paddingBottom: 2 }}>Perusahaan</td>
              <td colSpan={3} style={{ fontWeight: 700, paddingBottom: 2, color: "#1a56db" }}>{pr.companyName}</td>
            </tr>
          )}
          <tr>
            <td style={{ width: "12%", color: "#666", paddingBottom: 2 }}>Pemohon</td>
            <td style={{ width: "38%", fontWeight: 600, paddingBottom: 2 }}>{pr.requesterName}</td>
            <td style={{ width: "12%", color: "#666", paddingBottom: 2 }}>Departemen</td>
            <td style={{ width: "38%", paddingBottom: 2 }}>{pr.department}</td>
          </tr>
          <tr>
            <td style={{ color: "#666", paddingBottom: 2 }}>Tipe</td>
            <td style={{ paddingBottom: 2 }}>{getTypeLabel(pr.type)}</td>
            <td style={{ color: "#666", paddingBottom: 2 }}>Tanggal</td>
            <td style={{ paddingBottom: 2 }}>{formatDate(pr.createdAt)}</td>
          </tr>
          {pr.type === "leave" && (
            <tr>
              <td style={{ color: "#666", paddingBottom: 2 }}>Karyawan</td>
              <td style={{ paddingBottom: 2 }}>{pr.leaveRequesterName || pr.requesterName}</td>
              <td style={{ color: "#666", paddingBottom: 2 }}>Tgl Cuti</td>
              <td style={{ paddingBottom: 2 }}>{pr.leaveStartDate} s/d {pr.leaveEndDate}</td>
            </tr>
          )}
          {pr.type === "transfer" && (
            <tr>
              <td style={{ color: "#666", paddingBottom: 2 }}>Dari</td>
              <td style={{ paddingBottom: 2 }}>{pr.fromLocationName}</td>
              <td style={{ color: "#666", paddingBottom: 2 }}>Ke</td>
              <td style={{ paddingBottom: 2 }}>{pr.toLocationName}</td>
            </tr>
          )}
          <tr>
            <td style={{ color: "#666", paddingBottom: 2 }}>Deskripsi</td>
            <td colSpan={3} style={{ paddingBottom: 2 }}>{pr.description}{pr.notes ? ` — ${pr.notes}` : ""}</td>
          </tr>
        </tbody>
      </table>

      {/* Items */}
      {pr.items.length > 0 && (
        <div style={{ marginBottom: 6 }}>
          <div style={{ fontWeight: 700, fontSize: 9, borderBottom: "1.5px solid #1a56db", color: "#1a56db", paddingBottom: 2, marginBottom: 2 }}>DAFTAR BARANG / ITEM</div>
          <table style={{ width: "100%", fontSize: 10, borderCollapse: "collapse" }}>
            <colgroup>
              <col style={{ width: "5%" }} />
              <col style={{ width: "42%" }} />
              <col style={{ width: "8%" }} />
              <col style={{ width: "8%" }} />
              <col style={{ width: "18%" }} />
              <col style={{ width: "19%" }} />
            </colgroup>
            <thead>
              <tr style={{ background: "#e8f0fe" }}>
                <th style={{ padding: "4px 6px", border: "1px solid #c7d2fe", textAlign: "center" }}>No</th>
                <th style={{ padding: "4px 6px", border: "1px solid #c7d2fe", textAlign: "left" }}>NAMA BARANG</th>
                <th style={{ padding: "4px 6px", border: "1px solid #c7d2fe", textAlign: "right" }}>QTY</th>
                <th style={{ padding: "4px 6px", border: "1px solid #c7d2fe", textAlign: "center" }}>SAT</th>
                <th style={{ padding: "4px 6px", border: "1px solid #c7d2fe", textAlign: "right" }}>EST. HARGA</th>
                <th style={{ padding: "4px 6px", border: "1px solid #c7d2fe", textAlign: "right" }}>SUBTOTAL</th>
              </tr>
            </thead>
            <tbody>
              {pr.items.map((item: any, i: number) => (
                <tr key={item.id} style={{ background: i % 2 === 1 ? "#f5f8ff" : undefined }}>
                  <td style={{ padding: "4px 6px", border: "1px solid #e2e8f0", textAlign: "center" }}>{i + 1}</td>
                  <td style={{ padding: "4px 6px", border: "1px solid #e2e8f0", fontWeight: 600, textTransform: "uppercase" }}>{item.name}{item.description ? ` — ${item.description}` : ""}</td>
                  <td style={{ padding: "4px 6px", border: "1px solid #e2e8f0", textAlign: "right" }}>{item.qty}</td>
                  <td style={{ padding: "4px 6px", border: "1px solid #e2e8f0", textAlign: "center" }}>{item.unit}</td>
                  <td style={{ padding: "4px 6px", border: "1px solid #e2e8f0", textAlign: "right" }}>{formatIDR(item.estimatedPrice)}</td>
                  <td style={{ padding: "4px 6px", border: "1px solid #e2e8f0", textAlign: "right", fontWeight: 600 }}>{formatIDR(item.qty * item.estimatedPrice)}</td>
                </tr>
              ))}
              <tr style={{ fontWeight: 700 }}>
                <td colSpan={5} style={{ padding: "2px 4px", border: "1px solid #e2e8f0", textAlign: "right", background: "#f1f5f9" }}>TOTAL ESTIMASI</td>
                <td style={{ padding: "2px 4px", border: "1px solid #e2e8f0", textAlign: "right", color: "#1a56db", background: "#f1f5f9" }}>{formatIDR(parseFloat(pr.totalAmount))}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Vendor */}
      {(pr.vendorAttachments || []).length > 0 && (() => {
        const selected = (pr.vendorAttachments || []).find((v: any) => v.id === pr.selectedVendorId) || (pr.vendorAttachments || [])[0];
        return (
          <div style={{ marginBottom: 6, fontSize: 9, borderBottom: "1px solid #e2e8f0", paddingBottom: 4 }}>
            <span style={{ color: "#666" }}>Vendor Dipilih: </span>
            <span style={{ fontWeight: 700 }}>{selected?.vendorName || "—"}</span>
            {selected && (
              <span style={{ color: "#555" }}> &nbsp;|&nbsp; Penawaran: <strong>{selected.quotedPrice ? formatIDR(parseFloat(selected.quotedPrice)) : selected.totalAmount ? formatIDR(parseFloat(selected.totalAmount)) : "—"}</strong>
                {selected.notes ? ` — ${selected.notes}` : ""}
              </span>
            )}
          </div>
        );
      })()}

      {/* Approval Chain */}
      {pr.approvals.length > 0 && (
        <div style={{ marginBottom: 6 }}>
          <div style={{ fontWeight: 700, fontSize: 9, borderBottom: "1.5px solid #4c1d95", color: "#4c1d95", paddingBottom: 2, marginBottom: 2 }}>ALUR PERSETUJUAN</div>
          <table style={{ width: "100%", fontSize: 9, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f5f3ff" }}>
                <th style={{ padding: "2px 4px", border: "1px solid #e2e8f0", textAlign: "center" }}>Level</th>
                <th style={{ padding: "2px 4px", border: "1px solid #e2e8f0", textAlign: "left" }}>Approver</th>
                <th style={{ padding: "2px 4px", border: "1px solid #e2e8f0", textAlign: "center" }}>Status</th>
                <th style={{ padding: "2px 4px", border: "1px solid #e2e8f0", textAlign: "center" }}>Tgl</th>
                <th style={{ padding: "2px 4px", border: "1px solid #e2e8f0", textAlign: "left" }}>Catatan</th>
                <th style={{ padding: "2px 4px", border: "1px solid #e2e8f0", textAlign: "center", width: "15%" }}>Tanda Tangan</th>
              </tr>
            </thead>
            <tbody>
              {pr.approvals.map((app: any) => (
                <tr key={app.id}>
                  <td style={{ padding: "2px 4px", border: "1px solid #e2e8f0", textAlign: "center" }}>{app.level === 0 ? "Atasan" : `L${app.level}`}</td>
                  <td style={{ padding: "2px 4px", border: "1px solid #e2e8f0", fontWeight: 600 }}>{app.approverName}</td>
                  <td style={{ padding: "2px 4px", border: "1px solid #e2e8f0", textAlign: "center", fontWeight: 700, color: app.status === "approved" ? "#15803d" : app.status === "rejected" ? "#dc2626" : "#888" }}>
                    {app.status === "approved" ? "Disetujui" : app.status === "rejected" ? "Ditolak" : "Menunggu"}
                  </td>
                  <td style={{ padding: "2px 4px", border: "1px solid #e2e8f0", textAlign: "center", color: "#555" }}>{app.actionAt ? formatDate(app.actionAt) : "—"}</td>
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

      {/* Footer */}
      <div style={{ borderTop: "1px solid #ddd", paddingTop: 4, marginTop: 4, fontSize: 8, color: "#999", display: "flex", justifyContent: "space-between" }}>
        <span>{settings?.appName || "ProcureFlow"} — digenerate otomatis</span>
        <span>{pr.prNumber} | {new Date().toLocaleString("id-ID")}</span>
      </div>
    </div>
  );
}
