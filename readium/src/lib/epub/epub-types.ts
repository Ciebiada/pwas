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
