import {
  deleteFile,
  downloadFile,
  getAuthUrl,
  getFileMetadata,
  isDropboxInitialized,
  listFiles,
  moveFile,
  uploadFile,
} from "./dropbox";
import type { SyncProvider, UploadResponse } from "./syncProvider";

export const DropboxProvider: SyncProvider = {
  name: "dropbox",
  isAuthenticated: isDropboxInitialized,
  getAuthUrl,
  listFiles,
  getFileMetadata,
  uploadFile: async (path: string, content: string): Promise<UploadResponse> => {
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
  moveFile,
};
