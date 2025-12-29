import JSZip from 'jszip';
import type {
    EpubPackage,
    EpubMetadata,
    EpubManifestItem,
    EpubSpineItem,
    EpubNavPoint,
} from './epub-types';

export class EpubParser {
    private zip: JSZip | null = null;
    private opfPath: string = '';
    private opfDir: string = '';

    async load(arrayBuffer: ArrayBuffer): Promise<EpubPackage> {
        this.zip = await JSZip.loadAsync(arrayBuffer);

        this.opfPath = await this.findOpfPath();
        this.opfDir = this.opfPath.substring(0, this.opfPath.lastIndexOf('/') + 1);

        const opfContent = await this.getFileAsText(this.opfPath);
        const opfDoc = this.parseXml(opfContent);

        const metadata = this.parseMetadata(opfDoc);
        const manifest = this.parseManifest(opfDoc);
        const spine = this.parseSpine(opfDoc, manifest);
        const toc = await this.parseToc(manifest);

        return {
            metadata,
            manifest,
            spine,
            toc,
            opfPath: this.opfPath,
        };
    }

    async getFile(path: string): Promise<Blob | null> {
        if (!this.zip) return null;

        const fullPath = this.resolvePath(path);
        const file = this.zip.file(fullPath);

        if (!file) return null;

        return await file.async('blob');
    }

    async getFileAsText(path: string): Promise<string> {
        if (!this.zip) return '';

        const file = this.zip.file(path);
        if (!file) return '';

        return await file.async('string');
    }

    private async findOpfPath(): Promise<string> {
        const containerXml = await this.getFileAsText('META-INF/container.xml');
        const doc = this.parseXml(containerXml);
        const rootfile = doc.querySelector('rootfile');

        return rootfile?.getAttribute('full-path') || '';
    }

    private parseMetadata(opfDoc: Document): EpubMetadata {
        const metadata = opfDoc.querySelector('metadata');

        return {
            title: metadata?.querySelector('title')?.textContent || 'Unknown Title',
            creator: metadata?.querySelector('creator')?.textContent || 'Unknown Author',
            language: metadata?.querySelector('language')?.textContent || undefined,
            identifier: metadata?.querySelector('identifier')?.textContent || undefined,
            publisher: metadata?.querySelector('publisher')?.textContent || undefined,
        };
    }

    private parseManifest(opfDoc: Document): Map<string, EpubManifestItem> {
        const manifest = new Map<string, EpubManifestItem>();
        const items = opfDoc.querySelectorAll('manifest > item');

        items.forEach((item) => {
            const id = item.getAttribute('id') || '';
            const href = item.getAttribute('href') || '';
            const mediaType = item.getAttribute('media-type') || '';

            manifest.set(id, { id, href, mediaType });
        });

        return manifest;
    }

    private parseSpine(opfDoc: Document, manifest: Map<string, EpubManifestItem>): EpubSpineItem[] {
        const spine: EpubSpineItem[] = [];
        const items = opfDoc.querySelectorAll('spine > itemref');

        items.forEach((item) => {
            const idref = item.getAttribute('idref') || '';
            const linear = item.getAttribute('linear') !== 'no';

            // Get size from zip
            let size = 0;
            const manifestItem = manifest.get(idref);
            if (manifestItem && this.zip) {
                const fullPath = this.resolvePath(manifestItem.href);
                const zipFile = this.zip.file(fullPath);
                // @ts-expect-error - JSZip internal size property is usually reliable for a rough estimate
                size = zipFile?._data?.uncompressedSize || 0;

                // Fallback if _data is not available (browser-dependent)
                if (size === 0 && zipFile) {
                    // This is less efficient but guaranteed if zip is loaded
                    // For now let's hope for the best or assume 1000 bytes as fallback
                    size = 1000;
                }
            }

            spine.push({ idref, size, linear });
        });

        return spine;
    }

    private async parseToc(manifest: Map<string, EpubManifestItem>): Promise<EpubNavPoint[]> {
        const ncxItem = Array.from(manifest.values()).find(
            (item) => item.mediaType === 'application/x-dtbncx+xml'
        );

        if (!ncxItem) return [];

        const ncxContent = await this.getFileAsText(this.resolvePath(ncxItem.href));
        const ncxDoc = this.parseXml(ncxContent);

        return this.parseNavMap(ncxDoc);
    }

    private parseNavMap(ncxDoc: Document): EpubNavPoint[] {
        const navPoints = ncxDoc.querySelectorAll('navMap > navPoint');
        return Array.from(navPoints).map((np) => this.parseNavPoint(np));
    }

    private parseNavPoint(element: Element): EpubNavPoint {
        const id = element.getAttribute('id') || '';
        const label = element.querySelector('navLabel > text')?.textContent || '';
        const content = element.querySelector('content')?.getAttribute('src') || '';

        const childNavPoints = element.querySelectorAll(':scope > navPoint');
        const children =
            childNavPoints.length > 0
                ? Array.from(childNavPoints).map((np) => this.parseNavPoint(np))
                : undefined;

        return { id, label, content, children };
    }

    private parseXml(xmlString: string): Document {
        const parser = new DOMParser();
        return parser.parseFromString(xmlString, 'application/xml');
    }

    resolvePath(path: string): string {
        if (path.startsWith('/')) return path.slice(1);
        if (path.startsWith('http')) return path;

        return this.opfDir + path;
    }
}
