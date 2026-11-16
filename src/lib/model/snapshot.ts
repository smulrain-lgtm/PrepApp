import { DEFAULT_SETTINGS } from './constants';
import type { AnyDoc, Settings, Snapshot } from './types';

/** Group a flat list of documents into a Snapshot. Soft-deleted records are kept; callers filter. */
export function snapshotFromDocs(docs: AnyDoc[]): Snapshot {
  const snap: Snapshot = {
    settings: { ...DEFAULT_SETTINGS, updatedAt: new Date(0).toISOString() } as Settings,
    categories: [],
    items: [],
    batches: [],
    movements: [],
    checklistSections: [],
    checklistItems: [],
    contacts: [],
    infoNotes: [],
    purchases: [],
    lists: [],
  };
  for (const doc of docs) {
    switch (doc.type) {
      case 'settings':
        snap.settings = doc;
        break;
      case 'category':
        snap.categories.push(doc);
        break;
      case 'item':
        snap.items.push(doc);
        break;
      case 'batch':
        snap.batches.push(doc);
        break;
      case 'movement':
        snap.movements.push(doc);
        break;
      case 'checklistSection':
        snap.checklistSections.push(doc);
        break;
      case 'checklistItem':
        snap.checklistItems.push(doc);
        break;
      case 'contact':
        snap.contacts.push(doc);
        break;
      case 'infoNote':
        snap.infoNotes.push(doc);
        break;
      case 'purchase':
        snap.purchases.push(doc);
        break;
      case 'list':
        snap.lists.push(doc);
        break;
    }
  }
  const byOrder = <T extends { order: number }>(a: T, b: T) => a.order - b.order;
  snap.categories.sort(byOrder);
  snap.checklistSections.sort(byOrder);
  snap.checklistItems.sort(byOrder);
  snap.purchases.sort(byOrder);
  snap.lists.sort(byOrder);
  snap.contacts.sort((a, b) => a.priority - b.priority);
  return snap;
}
