declare module "word-extractor" {
  export default class WordExtractor {
    extract(path: string | Buffer): Promise<{ getBody(): string }>;
  }
}
declare module "pdf-parse/lib/pdf-parse.js" {
  const pdf: (data: Buffer) => Promise<{ text: string }>;
  export default pdf;
}
