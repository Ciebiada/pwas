import {
  downloadBinaryFile,
  downloadTextFile,
  getAuthUrl,
  getFileByName,
  isGoogleDriveInitialized,
  uploadBinaryFile,
  uploadTextFile,
} from "./googleDrive";
import type { SyncProvider } from "./syncProvider";

export const GoogleDriveProvider: SyncProvider = {
  name: "googledrive",
  isAuthenticated: isGoogleDriveInitialized,
  getAuthUrl,
  getFileByName,
  uploadTextFile,
  downloadTextFile,
  uploadBinaryFile,
  downloadBinaryFile,
};
