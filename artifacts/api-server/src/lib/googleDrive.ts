import { ReplitConnectors } from "@replit/connectors-sdk";

// Google Drive upload helper using Replit Connectors SDK
// Connection: google-drive (conn_google-drive_01KN40MHJ6570ERFM8BBWQRK4V)

function extractFolderId(urlOrId: string): string {
  const match = urlOrId.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : urlOrId;
}

export async function uploadToGoogleDrive(opts: {
  base64Data: string;
  filename: string;
  mimeType?: string;
  folderIdOrUrl: string;
}): Promise<{ fileId: string; webViewLink: string; webContentLink: string }> {
  const { base64Data, filename, mimeType = "application/octet-stream", folderIdOrUrl } = opts;
  const folderId = extractFolderId(folderIdOrUrl);
  const connectors = new ReplitConnectors();

  const buffer = Buffer.from(base64Data, "base64");

  const boundary = "----ProcureFlowBoundary" + Date.now();
  const metadata = JSON.stringify({ name: filename, parents: [folderId] });

  const bodyParts: Buffer[] = [];
  bodyParts.push(Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`
  ));
  bodyParts.push(Buffer.from(
    `--${boundary}\r\nContent-Type: ${mimeType}\r\nContent-Transfer-Encoding: base64\r\n\r\n`
  ));
  bodyParts.push(Buffer.from(base64Data));
  bodyParts.push(Buffer.from(`\r\n--${boundary}--`));

  const body = Buffer.concat(bodyParts);

  const uploadResp = await connectors.proxy(
    "google-drive",
    "/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink,webContentLink",
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
    throw new Error(`Google Drive upload failed (${uploadResp.status}): ${errText}`);
  }

  const result = await uploadResp.json() as { id: string; webViewLink: string; webContentLink: string };

  await connectors.proxy("google-drive", `/drive/v3/files/${result.id}/permissions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role: "reader", type: "anyone" }),
  });

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
