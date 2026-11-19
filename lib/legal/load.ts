// Reads a document from legal/ while the site is being built. The pages that use it are static, so the file is read
// once at build time and the finished page is what gets served.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { publicDocument, type PublicDocument } from './publish';

const FILES = { privacy: 'privacy-policy.md', terms: 'terms-of-service.md' } as const;
export type LegalDoc = keyof typeof FILES;

const cache = new Map<LegalDoc, PublicDocument>();

export function loadLegal(which: LegalDoc): PublicDocument {
  let doc = cache.get(which);
  if (!doc) {
    doc = publicDocument(readFileSync(join(process.cwd(), 'legal', FILES[which]), 'utf8'));
    cache.set(which, doc);
    if (!doc.ready) {
      console.warn(`[legal] /${which} shows the holding page: ${doc.blanks.length} open items in legal/${FILES[which]}.`);
    }
  }
  return doc;
}
