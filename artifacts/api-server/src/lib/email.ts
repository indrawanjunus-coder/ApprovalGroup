import nodemailer from "nodemailer";
import { db } from "@workspace/db";
import { settingsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

async function getSmtpSettings() {
  const rows = await db.select().from(settingsTable).where(
    eq(settingsTable.key, settingsTable.key)
  );
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;
  return {
    host: map["smtp_host"] || "",
    port: parseInt(map["smtp_port"] || "587"),
    user: map["smtp_user"] || "",
    pass: map["smtp_password"] || "",
    security: map["smtp_security"] || "STARTTLS",
    from: map["smtp_from"] || map["smtp_user"] || "",
    enabled: !!(map["smtp_host"] && map["smtp_user"] && map["smtp_password"]),
  };
}

function buildTransporter(cfg: Awaited<ReturnType<typeof getSmtpSettings>>) {
  const secure = cfg.security === "SSL/TLS";
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure,
    auth: { user: cfg.user, pass: cfg.pass },
    tls: cfg.security === "STARTTLS" ? { rejectUnauthorized: false } : undefined,
  });
}

export async function sendEmail(to: string | string[], subject: string, html: string) {
  try {
    const cfg = await getSmtpSettings();
    if (!cfg.enabled) return;
    const transporter = buildTransporter(cfg);
    await transporter.sendMail({
      from: `"ProcureFlow" <${cfg.from}>`,
      to: Array.isArray(to) ? to.join(", ") : to,
      subject,
      html,
    });
  } catch (err) {
    console.error("[Email] Failed to send:", err);
  }
}

export async function sendApprovalRequestEmail(approverEmail: string, approverName: string, prNumber: string, requesterName: string, amount: number, description: string) {
  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
      <h2 style="color:#2563eb">ProcureFlow — Permintaan Persetujuan</h2>
      <p>Yth. <b>${approverName}</b>,</p>
      <p>Ada Purchase Request baru yang memerlukan persetujuan Anda:</p>
      <table style="border-collapse:collapse;width:100%;margin:16px 0">
        <tr><td style="padding:8px;background:#f1f5f9;font-weight:bold">Nomor PR</td><td style="padding:8px">${prNumber}</td></tr>
        <tr><td style="padding:8px;background:#f1f5f9;font-weight:bold">Pemohon</td><td style="padding:8px">${requesterName}</td></tr>
        <tr><td style="padding:8px;background:#f1f5f9;font-weight:bold">Deskripsi</td><td style="padding:8px">${description}</td></tr>
        <tr><td style="padding:8px;background:#f1f5f9;font-weight:bold">Total</td><td style="padding:8px">Rp ${amount.toLocaleString("id-ID")}</td></tr>
      </table>
      <p>Silakan login ke sistem ProcureFlow untuk melakukan persetujuan.</p>
    </div>`;
  await sendEmail(approverEmail, `[ProcureFlow] Persetujuan Diperlukan: ${prNumber}`, html);
}

export async function sendPOCreatedEmail(purchasingEmail: string, purchasingName: string, poNumber: string, prNumber: string, supplier: string, amount: number) {
  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
      <h2 style="color:#2563eb">ProcureFlow — Purchase Order Dibuat</h2>
      <p>Yth. <b>${purchasingName}</b>,</p>
      <p>Purchase Order baru telah dibuat dan perlu diterbitkan:</p>
      <table style="border-collapse:collapse;width:100%;margin:16px 0">
        <tr><td style="padding:8px;background:#f1f5f9;font-weight:bold">Nomor PO</td><td style="padding:8px">${poNumber}</td></tr>
        <tr><td style="padding:8px;background:#f1f5f9;font-weight:bold">Ref PR</td><td style="padding:8px">${prNumber}</td></tr>
        <tr><td style="padding:8px;background:#f1f5f9;font-weight:bold">Supplier</td><td style="padding:8px">${supplier}</td></tr>
        <tr><td style="padding:8px;background:#f1f5f9;font-weight:bold">Total</td><td style="padding:8px">Rp ${amount.toLocaleString("id-ID")}</td></tr>
      </table>
    </div>`;
  await sendEmail(purchasingEmail, `[ProcureFlow] PO Baru: ${poNumber}`, html);
}

export async function sendVendorAttachmentRequestEmail(requesterEmail: string, requesterName: string, prNumber: string) {
  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
      <h2 style="color:#2563eb">ProcureFlow — PR Disetujui, Lampirkan Penawaran Vendor</h2>
      <p>Yth. <b>${requesterName}</b>,</p>
      <p>Purchase Request <b>${prNumber}</b> Anda telah disetujui. Silakan login ke sistem dan lampirkan penawaran dari vendor agar proses dapat dilanjutkan.</p>
    </div>`;
  await sendEmail(requesterEmail, `[ProcureFlow] PR ${prNumber} Disetujui — Upload Penawaran Vendor`, html);
}

export async function sendReceivingReadyEmail(requesterEmail: string, requesterName: string, prNumber: string, poNumber?: string) {
  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
      <h2 style="color:#2563eb">ProcureFlow — Barang Siap Diterima</h2>
      <p>Yth. <b>${requesterName}</b>,</p>
      <p>${poNumber ? `PO <b>${poNumber}</b> (ref PR <b>${prNumber}</b>)` : `PR <b>${prNumber}</b>`} telah diterbitkan. Barang siap untuk proses penerimaan.</p>
      <p>Silakan login ke sistem ProcureFlow dan lakukan penerimaan barang.</p>
    </div>`;
  await sendEmail(requesterEmail, `[ProcureFlow] Barang Siap Diterima: ${prNumber}`, html);
}

export async function sendNewUserEmail(userEmail: string, userName: string, username: string, password: string) {
  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
      <h2 style="color:#2563eb">ProcureFlow — Akun Anda Telah Dibuat</h2>
      <p>Yth. <b>${userName}</b>,</p>
      <p>Akun ProcureFlow Anda telah berhasil dibuat. Berikut detail login Anda:</p>
      <table style="border-collapse:collapse;width:100%;margin:16px 0">
        <tr><td style="padding:8px;background:#f1f5f9;font-weight:bold">Username</td><td style="padding:8px">${username}</td></tr>
        <tr><td style="padding:8px;background:#f1f5f9;font-weight:bold">Password</td><td style="padding:8px">${password}</td></tr>
      </table>
      <p>Segera login dan ubah password Anda untuk keamanan.</p>
    </div>`;
  await sendEmail(userEmail, `[ProcureFlow] Akun Anda Telah Dibuat`, html);
}
