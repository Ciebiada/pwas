import { SyncProvider, RemoteFile, UploadResponse } from "./syncProvider";
import {
  isDropboxInitialized,
  getAuthUrl,
  listFiles,
  getFileMetadata,
  uploadFile,
  downloadFile,
  deleteFile,
  moveFile,
  DropboxFile,
} from "./dropbox";

export const DropboxProvider: SyncProvider = {
  name: "dropbox",
  isAuthenticated: isDropboxInitialized,
  getAuthUrl: getAuthUrl,
  listFiles: async (path: string): Promise<RemoteFile[]> => {
    const files = await listFiles(path);
    return files.map((f) => ({
      ...f,
      // Ensure properties match RemoteFile
    }));
  },
  getFileMetadata: async (path: string): Promise<RemoteFile | null> => {
    const file = await getFileMetadata(path);
    if (!file) return null;
    return {
      ...file,
    };
  },
  uploadFile: async (
    path: string,
    content: string,
  ): Promise<UploadResponse> => {
    const res = await uploadFile(path, content);
    return {
      id: res.id,
      name: res.name,
      client_modified: res.client_modified,
      server_modified: res.server_modified,
    };
  },
  downloadFile: downloadFile,
  deleteFile: deleteFile,
  moveFile: async (fromPath: string, toPath: string): Promise<RemoteFile> => {
    const res = await moveFile(fromPath, toPath);
    return res;
  },
};
