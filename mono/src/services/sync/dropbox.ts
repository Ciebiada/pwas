import { Dropbox, DropboxAuth } from "dropbox";

export type UploadResponse = {
  id: string;
  name: string;
  path_display: string;
  path_lower: string;
  rev: string;
  size: number;
  client_modified: string;
  server_modified: string;
  content_hash: string;
  is_downloadable: boolean;
};

export type DropboxFile = {
  id: string;
  name: string;
  path: string;
  isFolder: boolean;
  size: number;
  lastModified: string;
};

let dbxAuth: DropboxAuth;
let dbx: Dropbox;
let redirectUri: string;

const CLIENT_ID = "fl4ciq0sbdc8a1r";
const REDIRECT_PATH = "dropbox-callback";

export const getAuthUrl = async (): Promise<string> => {
  const authUrl = await dbxAuth.getAuthenticationUrl(
    redirectUri,
    undefined,
    "code",
    "offline",
    undefined,
    undefined,
    true,
  );

  sessionStorage.setItem("dropbox_code_verifier", dbxAuth.getCodeVerifier());

  return String(authUrl);
};

export const handleAuthCallback = async (code: string): Promise<boolean> => {
  try {
    const codeVerifier = sessionStorage.getItem("dropbox_code_verifier");

    if (!codeVerifier) {
      console.error("Missing code verifier");
      return false;
    }

    dbxAuth.setCodeVerifier(codeVerifier as string);

    const response = await dbxAuth.getAccessTokenFromCode(redirectUri, code);

    if (response?.result && (response.result as any).access_token) {
      setAccessToken((response.result as any).access_token);

      if ((response.result as any).refresh_token) {
        localStorage.setItem(
          "dropbox_refresh_token",
          (response.result as any).refresh_token,
        );
      }

      return true;
    }
    return false;
  } catch (error) {
    console.error("Error handling auth callback:", error);
    return false;
  }
};

export const setAccessToken = (token: string): void => {
  dbxAuth.setAccessToken(token);
  localStorage.setItem("dropbox_access_token", token);
};

export const disconnectDropbox = (): void => {
  localStorage.removeItem("dropbox_access_token");
  localStorage.removeItem("dropbox_refresh_token");
};

export const refreshAccessToken = async (): Promise<boolean> => {
  if (!isDropboxInitialized()) {
    return false;
  }

  const refreshToken = localStorage.getItem("dropbox_refresh_token");
  if (!refreshToken) {
    return false;
  }

  try {
    dbxAuth.setRefreshToken(refreshToken);
    await dbxAuth.refreshAccessToken();
    setAccessToken(dbxAuth.getAccessToken());

    return true;
  } catch (error) {
    console.error("Error refreshing access token:", error);
    return false;
  }
};

const withRetryOnAuth = async <T>(operation: () => Promise<T>): Promise<T> => {
  try {
    return await operation();
  } catch (error: any) {
    if (error?.status === 401 || error?.response?.status === 401) {
      console.log(
        "Received 401 error, attempting to refresh token and retry...",
      );

      const refreshed = await refreshAccessToken();
      if (refreshed) {
        try {
          return await operation();
        } catch (retryError) {
          console.error("Retry after token refresh failed:", retryError);
          throw retryError;
        }
      } else {
        console.error("Token refresh failed");
        throw error;
      }
    }
    throw error;
  }
};

export const listFiles = async (path: string = ""): Promise<DropboxFile[]> => {
  if (!isDropboxInitialized()) {
    throw new Error("Dropbox not initialized. Call initDropbox first.");
  }

  return withRetryOnAuth(async () => {
    const response = await dbx.filesListFolder({
      path: path || "",
      recursive: false,
      include_media_info: false,
      include_deleted: false,
      include_has_explicit_shared_members: false,
    });

    return response.result.entries.map((entry: any) => ({
      id: entry.id,
      name: entry.name,
      path: entry.path_display,
      isFolder: entry[".tag"] === "folder",
      size: entry.size || 0,
      lastModified: entry.server_modified || "",
    }));
  });
};

export const getFileMetadata = async (
  path: string,
): Promise<DropboxFile | null> => {
  if (!isDropboxInitialized()) {
    throw new Error("Dropbox not initialized. Call initDropbox first.");
  }

  return withRetryOnAuth(async () => {
    try {
      const response = await dbx.filesGetMetadata({ path });
      const result: any = response.result;
      const entry = result.metadata || result; // Handle RelocationResult or direct metadata

      return {
        id: entry.id,
        name: entry.name,
        path: entry.path_display,
        isFolder: entry[".tag"] === "folder",
        size: entry.size || 0,
        lastModified: entry.server_modified || "",
      };
    } catch (error: any) {
      if (error?.status === 409) {
        // File not found
        return null;
      }
      throw error;
    }
  });
};

export const uploadFile = async (
  path: string,
  content: string,
): Promise<UploadResponse> => {
  if (!isDropboxInitialized()) {
    throw new Error("Dropbox not initialized. Call initDropbox first.");
  }

  return withRetryOnAuth(async () => {
    const response = await dbx.filesUpload({
      path,
      contents: content,
      mode: { ".tag": "overwrite" },
      autorename: false,
      mute: false,
    });

    return {
      id: response.result.id,
      name: response.result.name,
      path_display: response.result.path_display || "",
      path_lower: response.result.path_lower || "",
      rev: response.result.rev,
      size: response.result.size,
      client_modified: response.result.client_modified,
      server_modified: response.result.server_modified,
      content_hash: response.result.content_hash || "",
      is_downloadable: response.result.is_downloadable || true,
    };
  });
};

export const downloadFile = async (path: string): Promise<string> => {
  if (!isDropboxInitialized()) {
    throw new Error("Dropbox not initialized. Call initDropbox first.");
  }

  return withRetryOnAuth(async () => {
    const response = await dbx.filesDownload({ path });
    const fileBlob = (response.result as any).fileBlob;
    return fileBlob ? await fileBlob.text() : "";
  });
};

export const deleteFile = async (path: string): Promise<void> => {
  if (!isDropboxInitialized()) {
    throw new Error("Dropbox not initialized. Call initDropbox first.");
  }

  return withRetryOnAuth(async () => {
    await dbx.filesDeleteV2({ path });
  });
};

export const moveFile = async (
  fromPath: string,
  toPath: string,
): Promise<DropboxFile> => {
  if (!isDropboxInitialized()) {
    throw new Error("Dropbox not initialized. Call initDropbox first.");
  }

  return withRetryOnAuth(async () => {
    const response = await dbx.filesMoveV2({
      from_path: fromPath,
      to_path: toPath,
    });

    const entry: any = response.result;
    return {
      id: entry.id,
      name: entry.name,
      path: entry.path_display,
      isFolder: entry[".tag"] === "folder",
      size: entry.size || 0,
      lastModified: entry.server_modified || "",
    };
  });
};

export const isDropboxInitialized = (): boolean => {
  return (
    Boolean(localStorage.getItem("dropbox_access_token")) &&
    Boolean(localStorage.getItem("dropbox_refresh_token"))
  );
};

const initDropbox = (): void => {
  const baseUrl = window.location.origin;
  redirectUri = `${baseUrl}/${REDIRECT_PATH}`;

  dbxAuth = new DropboxAuth({ clientId: CLIENT_ID });
  dbx = new Dropbox({ auth: dbxAuth });

  if (isDropboxInitialized()) {
    dbxAuth.setAccessToken(localStorage.getItem("dropbox_access_token") || "");
    dbxAuth.setRefreshToken(
      localStorage.getItem("dropbox_refresh_token") || "",
    );
  }
};

initDropbox();
