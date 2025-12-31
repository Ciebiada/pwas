export type GoogleDriveFile = {
  id: string;
  name: string;
  mimeType: string;
  parents?: string[];
  modifiedTime?: string;
  size?: string;
};

const CLIENT_ID = import.meta.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = import.meta.env.GOOGLE_CLIENT_SECRET;
const SCOPES = "https://www.googleapis.com/auth/drive.file";
const REDIRECT_PATH = "google-callback";

let accessToken: string | null = localStorage.getItem("google_access_token");
let refreshToken: string | null = localStorage.getItem("google_refresh_token");
let tokenExpiration: number =
  Number(localStorage.getItem("google_token_expiration")) || 0;
let codeVerifier: string | null = null;

const generateCodeVerifier = (): string => {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
};

const generateCodeChallenge = async (verifier: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
};

export const getAuthUrl = async (): Promise<string> => {
  const baseUrl = window.location.origin;
  const redirectUri = `${baseUrl}/${REDIRECT_PATH}`;

  codeVerifier = generateCodeVerifier();
  sessionStorage.setItem("google_code_verifier", codeVerifier);

  const codeChallenge = await generateCodeChallenge(codeVerifier);

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    prompt: "consent",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
};

export const handleGoogleAuthCallback = async (
  code: string,
): Promise<boolean> => {
  try {
    const storedVerifier = sessionStorage.getItem("google_code_verifier");
    if (!storedVerifier) {
      console.error("Missing code verifier");
      return false;
    }

    const baseUrl = window.location.origin;
    const redirectUri = `${baseUrl}/${REDIRECT_PATH}`;

    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
        code_verifier: storedVerifier,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Token exchange failed:", errorData);
      return false;
    }

    const data = await response.json();

    if (data.access_token) {
      setTokens(data.access_token, data.refresh_token, data.expires_in);
      sessionStorage.removeItem("google_code_verifier");
      return true;
    }

    return false;
  } catch (error) {
    console.error("Error handling Google auth callback:", error);
    return false;
  }
};

const setTokens = (
  access: string,
  refresh: string | undefined,
  expiresInSeconds: number,
) => {
  accessToken = access;
  tokenExpiration = Date.now() + expiresInSeconds * 1000;
  localStorage.setItem("google_access_token", access);
  localStorage.setItem("google_token_expiration", String(tokenExpiration));

  if (refresh) {
    refreshToken = refresh;
    localStorage.setItem("google_refresh_token", refresh);
  }
};

export const refreshAccessToken = async (): Promise<boolean> => {
  if (!refreshToken) {
    console.warn("No refresh token available");
    return false;
  }

  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!response.ok) {
      console.error("Token refresh failed");
      disconnectGoogleDrive();
      return false;
    }

    const data = await response.json();

    if (data.access_token) {
      setTokens(data.access_token, undefined, data.expires_in);
      return true;
    }

    return false;
  } catch (error) {
    console.error("Error refreshing access token:", error);
    disconnectGoogleDrive();
    return false;
  }
};

export const isGoogleDriveInitialized = (): boolean => {
  return !!refreshToken;
};

export const disconnectGoogleDrive = () => {
  accessToken = null;
  refreshToken = null;
  tokenExpiration = 0;
  localStorage.removeItem("google_access_token");
  localStorage.removeItem("google_refresh_token");
  localStorage.removeItem("google_token_expiration");
  localStorage.removeItem("google_app_folder_id");
};

const fetchWithAuth = async (url: string, options: RequestInit = {}) => {
  if (!accessToken || Date.now() >= tokenExpiration) {
    const refreshed = await refreshAccessToken();
    if (!refreshed) {
      throw new Error("Google Token Expired");
    }
  }

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    ...options.headers,
  };

  let response = await fetch(url, { ...options, headers });

  if (response.status === 401) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      const newHeaders = {
        Authorization: `Bearer ${accessToken}`,
        ...options.headers,
      };
      response = await fetch(url, { ...options, headers: newHeaders });
    } else {
      throw new Error("Unauthorized");
    }
  }

  if (!response.ok) {
    throw new Error(
      `Google Drive API Error: ${response.status} ${response.statusText}`,
    );
  }
  return response;
};

const appFolderName = "mononote";
let appFolderId: string | null = localStorage.getItem("google_app_folder_id");

const getAppFolderId = async (): Promise<string> => {
  if (appFolderId) return appFolderId;

  const q = `name = '${appFolderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)`;
  const res = await fetchWithAuth(url);
  const data = await res.json();

  if (data.files && data.files.length > 0) {
    appFolderId = data.files[0].id;
    localStorage.setItem("google_app_folder_id", appFolderId!);
    return appFolderId!;
  }

  const metadata = {
    name: appFolderName,
    mimeType: "application/vnd.google-apps.folder",
  };

  const createUrl = "https://www.googleapis.com/drive/v3/files";
  const createRes = await fetchWithAuth(createUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(metadata),
  });

  const folder = await createRes.json();
  appFolderId = folder.id;
  localStorage.setItem("google_app_folder_id", appFolderId!);
  return appFolderId!;
};

export const listFiles = async (
  additionalQuery: string = "",
): Promise<GoogleDriveFile[]> => {
  const folderId = await getAppFolderId();
  let q = `'${folderId}' in parents and trashed = false`;

  if (additionalQuery) {
    q += ` and (${additionalQuery})`;
  } else {
    q += " and name contains '.md'";
  }

  const fields = "files(id, name, mimeType, modifiedTime, size)";
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent(fields)}`;

  const res = await fetchWithAuth(url);
  const data = await res.json();
  return data.files || [];
};

export const getFileMetadata = async (
  fileId: string,
): Promise<GoogleDriveFile | null> => {
  try {
    const url = `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,modifiedTime,size`;
    const res = await fetchWithAuth(url);
    return await res.json();
  } catch (e: any) {
    if (e.message.includes("404") || e.message.includes("Not Found")) {
      return null;
    }
    throw e;
  }
};

export const downloadFile = async (fileId: string): Promise<string> => {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  const res = await fetchWithAuth(url);
  return await res.text();
};

export const uploadFile = async (
  name: string | undefined,
  content: string,
  fileId?: string,
): Promise<GoogleDriveFile> => {
  const folderId = await getAppFolderId();

  const metadata: any = {
    mimeType: "text/markdown",
  };

  if (name) {
    metadata.name = name;
  }

  if (!fileId) {
    if (!name) throw new Error("Name is required for new files");
    metadata.parents = [folderId];
  }

  const form = new FormData();
  form.append(
    "metadata",
    new Blob([JSON.stringify(metadata)], { type: "application/json" }),
  );
  form.append("file", new Blob([content], { type: "text/markdown" }));

  const fields = "id,name,mimeType,modifiedTime,size";
  let url = `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=${encodeURIComponent(fields)}`;
  let method = "POST";

  if (fileId) {
    url = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart&fields=${encodeURIComponent(fields)}`;
    method = "PATCH";
  }

  const res = await fetchWithAuth(url, {
    method,
    body: form,
  });

  return await res.json();
};

export const deleteFile = async (fileId: string) => {
  await fetchWithAuth(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: "DELETE",
  });
};
