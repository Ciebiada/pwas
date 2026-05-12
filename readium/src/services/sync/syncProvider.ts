export type ProviderName = "googledrive";

export type RemoteFile = {
  id: string;
  name: string;
  ref: string;
  path?: string;
  size: number;
  lastModified: string;
};

export interface SyncProvider {
  name: ProviderName;
  isAuthenticated(): boolean;
  getAuthUrl(): Promise<string>;
  getFileByName(name: string): Promise<RemoteFile | null>;
  uploadTextFile(name: string, content: string, ref?: string): Promise<RemoteFile>;
  downloadTextFile(ref: string): Promise<string>;
  uploadBinaryFile(name: string, content: Blob | ArrayBuffer, mimeType: string, ref?: string): Promise<RemoteFile>;
  downloadBinaryFile(ref: string): Promise<ArrayBuffer>;
  deleteFile(ref: string): Promise<void>;
}
