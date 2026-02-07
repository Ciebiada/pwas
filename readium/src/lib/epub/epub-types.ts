export type EpubMetadata = {
  title: string;
  creator: string;
  language?: string;
  identifier?: string;
  publisher?: string;
};

export type EpubManifestItem = {
  id: string;
  href: string;
  mediaType: string;
};

export type EpubSpineItem = {
  idref: string;
  size: number;
  linear?: boolean;
};

export type EpubNavPoint = {
  id: string;
  label: string;
  content: string;
  children?: EpubNavPoint[];
};

export type EpubPackage = {
  metadata: EpubMetadata;
  manifest: Map<string, EpubManifestItem>;
  spine: EpubSpineItem[];
  toc: EpubNavPoint[];
  opfPath: string;
};

export type EpubResource = {
  url: string;
  blob: Blob;
};

export type RendererOptions = {
  container: HTMLElement;
  fontSize: number;
  fontFamily: string;
  margin: number;
  theme: "light" | "dark";
  invertImages: boolean;
};

export type EpubLocationDisplayed = {
  page: number;
  total: number;
  spineIndex: number;
  spineTotal: number;
  percentage: number;
};

export type EpubLocationStart = {
  cfi?: string;
  displayed: EpubLocationDisplayed;
};

export type EpubLocation = {
  start: EpubLocationStart;
  basic?: boolean;
};

export type LayoutInfo = {
  columnWidth: number;
  gap: number;
  pageStride: number;
  containerWidth: number;
  margin: number;
  isTwoColumn: boolean;
};
