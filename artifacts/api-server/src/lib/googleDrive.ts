import { ReplitConnectors } from "@replit/connectors-sdk";

// Google Drive upload helper using Replit Connectors SDK
// Connection: google-drive (conn_google-drive_01KN40MHJ6570ERFM8BBWQRK4V)
// Supports both My Drive folders and Shared Drives (supportsAllDrives=true)

function extractFolderId(urlOrId: string): string {
  const match = urlOrId.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : urlOrId.trim();
}

/** Find a subfolder by name inside parentId, or create it if missing. */
async function findOrCreateFolder(connectors: ReplitConnectors, name: string, parentId: string): Promise<string> {
  const safeName = name.replace(/[/\\?%*:|"<>]/g, "_");
  const query = encodeURIComponent(
    `name='${safeName}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`
  );
  const listResp = await connectors.proxy(
    "google-drive",
    `/drive/v3/files?q=${query}&fields=files(id,name)&supportsAllDrives=true&includeItemsFromAllDrives=true`,
    { method: "GET" }
  );
  const listData = await listResp.json() as { files: { id: string; name: string }[] };
  if (listData.files && listData.files.length > 0) {
    return listData.files[0].id;
  }
  const createResp = await connectors.proxy("google-drive", "/drive/v3/files?fields=id&supportsAllDrives=true", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: safeName, mimeType: "application/vnd.google-apps.folder", parents: [parentId] }),
  });
  if (!createResp.ok) {
    const errText = await createResp.text();
    throw new Error(`Gagal membuat folder "${safeName}" (${createResp.status}): ${errText}`);
  }
  const created = await createResp.json() as { id: string };
  return created.id;
}

/**
 * Build folder path: rootFolderId / YYYY / MM / CompanyName
 * Returns the ID of the deepest folder.
 */
async function resolveFolderPath(connectors: ReplitConnectors, rootId: string, companyName: string, date: Date): Promise<string> {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const safe = companyName.replace(/\s+/g, "_").replace(/[/\\?%*:|"<>]/g, "_");

  const yearId = await findOrCreateFolder(connectors, year, rootId);
  const monthId = await findOrCreateFolder(connectors, month, yearId);
  const companyId = await findOrCreateFolder(connectors, safe, monthId);
  return companyId;
}

/**
 * Format filename: YYYY-MM-DD-NamaPerusahaan-Label.ext
 * label can be a PO number or "KTP"
 */
export function buildDriveFilename(companyName: string, label: string, originalFilename: string, date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const safe = companyName.replace(/\s+/g, "-").replace(/[/\\?%*:|"<>]/g, "");
  const safeLabel = label.replace(/\s+/g, "-").replace(/[/\\?%*:|"<>]/g, "");
  const ext = originalFilename.split(".").pop()?.toLowerCase() || "bin";
  return `${y}-${m}-${d}-${safe}-${safeLabel}.${ext}`;
}

export async function uploadToGoogleDrive(opts: {
  base64Data: string;
  filename: string;
  mimeType?: string;
  folderIdOrUrl: string;
  companyName: string;
  label: string;
  /** Emails yang boleh baca file (vendor + internal users). Jika kosong, file tetap private. */
  shareWithEmails?: string[];
}): Promise<{ fileId: string; webViewLink: string; webContentLink: string }> {
  const { base64Data, filename, mimeType = "application/octet-stream", folderIdOrUrl, companyName, label, shareWithEmails = [] } = opts;
  const rootFolderId = extractFolderId(folderIdOrUrl);
  const connectors = new ReplitConnectors();
  const now = new Date();

  const targetFolderId = await resolveFolderPath(connectors, rootFolderId, companyName, now);
  const driveFilename = buildDriveFilename(companyName, label, filename, now);

  const boundary = "----ProcureFlowBoundary" + Date.now();
  const metadata = JSON.stringify({ name: driveFilename, parents: [targetFolderId] });

  // Decode base64 → binary bytes so the multipart body is ~25% smaller
  const fileBuffer = Buffer.from(base64Data, "base64");

  const bodyParts: Buffer[] = [];
  bodyParts.push(Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`
  ));
  bodyParts.push(Buffer.from(
    `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`
  ));
  bodyParts.push(fileBuffer);
  bodyParts.push(Buffer.from(`\r\n--${boundary}--`));

  const body = Buffer.concat(bodyParts);

  const uploadResp = await connectors.proxy(
    "google-drive",
    "/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink,webContentLink&supportsAllDrives=true",
    {
      method: "POST",
      headers: {
        "Content-Type": `multipart/related; boundary=${boundary}`,
        "Content-Length": String(body.length),
      },
      body,
    }
  );

  if (!uploadResp.ok) {
    const errText = await uploadResp.text();
    throw new Error(`Google Drive upload gagal (${uploadResp.status}): ${errText}`);
  }

  const result = await uploadResp.json() as { id: string; webViewLink: string; webContentLink: string };

  // Share hanya dengan email tertentu (vendor + internal users), bukan public
  const uniqueEmails = [...new Set(shareWithEmails.filter(e => e && e.includes("@")))];
  for (const email of uniqueEmails) {
    await connectors.proxy(
      "google-drive",
      `/drive/v3/files/${result.id}/permissions?supportsAllDrives=true&sendNotificationEmail=false`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "reader", type: "user", emailAddress: email }),
      }
    ).catch((e: any) => console.error(`GDrive share gagal untuk ${email}:`, e?.message));
  }

  return {
    fileId: result.id,
    webViewLink: result.webViewLink || `https://drive.google.com/file/d/${result.id}/view`,
    webContentLink: result.webContentLink || `https://drive.google.com/uc?id=${result.id}`,
  };
}

export function guessMimeType(filename: string): string {
  const ext = filename.toLowerCase().split(".").pop() || "";
  const map: Record<string, string> = {
    pdf: "application/pdf",
    jpg: "image/jpeg", jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
  return map[ext] || "application/octet-stream";
}
