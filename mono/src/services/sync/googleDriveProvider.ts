import { SyncProvider, RemoteFile, UploadResponse } from "./syncProvider";
import {
  isGoogleDriveInitialized,
  listFiles,
  getFileMetadata,
  uploadFile,
  downloadFile,
  deleteFile,
} from "./googleDrive";

export const GoogleDriveProvider: SyncProvider = {
  name: "googledrive",
  isAuthenticated: isGoogleDriveInitialized,
  getAuthUrl: async () => {
    return "";
  },
  listFiles: async (path: string): Promise<RemoteFile[]> => {
    const files = await listFiles();
    return files.map((f) => ({
      id: f.id,
      name: f.name,
      path: f.name,
      isFolder: f.mimeType === "application/vnd.google-apps.folder",
      size: Number(f.size) || 0,
      lastModified: f.modifiedTime || new Date().toISOString(),
    }));
  },
  getFileMetadata: async (path: string): Promise<RemoteFile | null> => {
    if (path.startsWith("/")) {
      const name = path.substring(1);
      const files = await listFiles(`name = '${name}' and trashed = false`);
      if (files.length > 0) {
        const f = files[0];
        return {
          id: f.id,
          name: f.name,
          path: f.name,
          isFolder: f.mimeType === "application/vnd.google-apps.folder",
          size: Number(f.size) || 0,
          lastModified: f.modifiedTime || new Date().toISOString(),
        };
      }
      return null;
    }

    const f = await getFileMetadata(path);
    if (!f) return null;
    return {
      id: f.id,
      name: f.name,
      path: f.name,
      isFolder: f.mimeType === "application/vnd.google-apps.folder",
      size: Number(f.size) || 0,
      lastModified: f.modifiedTime || new Date().toISOString(),
    };
  },
  uploadFile: async (
    path: string,
    content: string,
  ): Promise<UploadResponse> => {
    let fileId: string | undefined;
    let name: string | undefined;

    if (!path.startsWith("/")) {
      fileId = path;
    } else {
      name = path.substring(1);
    }

    const res = await uploadFile(name, content, fileId);
    return {
      id: res.id,
      name: res.name,
      client_modified: new Date().toISOString(),
      server_modified: res.modifiedTime || new Date().toISOString(),
    };
  },
  downloadFile: async (path: string): Promise<string> => {
    return await downloadFile(path);
  },
  deleteFile: async (path: string): Promise<void> => {
    await deleteFile(path);
  },
  moveFile: async (fromPath: string, toPath: string): Promise<RemoteFile> => {
    const name = toPath.startsWith("/") ? toPath.substring(1) : toPath;
    const res = await uploadFile(name, "", fromPath);

    return {
      id: res.id,
      name: res.name,
      path: res.name,
      isFolder: false,
      size: 0,
      lastModified: res.modifiedTime || "",
    };
  },
};
