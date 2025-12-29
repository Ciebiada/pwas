export type RemoteFile = {
  id: string;
  name: string;
  path?: string; // Optional because Google Drive doesn't really use paths
  isFolder: boolean;
  size: number;
  lastModified: string;
};

export type UploadResponse = {
  id: string;
  name: string;
  client_modified: string;
  server_modified: string;
};

export interface SyncProvider {
  name: "dropbox" | "googledrive";
  isAuthenticated(): boolean;
  getAuthUrl(): Promise<string>;
  listFiles(path: string): Promise<RemoteFile[]>;
  getFileMetadata(path: string): Promise<RemoteFile | null>;
  uploadFile(path: string, content: string): Promise<UploadResponse>;
  downloadFile(path: string): Promise<string>;
  deleteFile(path: string): Promise<void>;
  moveFile(fromPath: string, toPath: string): Promise<RemoteFile>;
}
