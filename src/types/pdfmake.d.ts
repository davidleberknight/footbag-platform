// The slice of pdfmake's server API the printable-document renderer uses.
// pdfmake ships no type declarations of its own.
declare module 'pdfmake' {
  interface PdfmakeOutputDocument {
    getBuffer(): Promise<Buffer>;
  }
  interface PdfmakeServer {
    sharedVirtualfs: { writeFileSync(name: string, content: Buffer): void; existsSync(name: string): boolean };
    setFonts(fonts: Record<string, { normal: string; bold: string; italics: string; bolditalics: string }>): void;
    setUrlAccessPolicy(callback: (url: string) => boolean): void;
    setLocalAccessPolicy(callback: (path: string) => boolean): void;
    createPdf(docDefinition: object, options?: object): PdfmakeOutputDocument;
  }
  const pdfmake: PdfmakeServer;
  export = pdfmake;
}
