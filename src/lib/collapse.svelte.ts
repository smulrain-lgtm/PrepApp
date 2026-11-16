/**
 * Show / hide groups (inventory categories, checklist sections, list groups).
 * Remembered per device and per screen; a convenience, so storage errors are ignored.
 */
import { SvelteSet } from 'svelte/reactivity';

export class Collapsed {
  private readonly hidden: SvelteSet<string>;

  constructor(private readonly key: string) {
    let saved: string[] = [];
    try {
      saved = JSON.parse(localStorage.getItem(`prepapp.collapsed.${key}`) ?? '[]') as string[];
    } catch {
      /* none saved */
    }
    this.hidden = new SvelteSet(Array.isArray(saved) ? saved : []);
  }

  isOpen(id: string): boolean {
    return !this.hidden.has(id);
  }

  toggle(id: string): void {
    if (this.hidden.has(id)) this.hidden.delete(id);
    else this.hidden.add(id);
    this.save();
  }

  /** Open or close every one of these groups. */
  setAll(ids: string[], open: boolean): void {
    for (const id of ids) {
      if (open) this.hidden.delete(id);
      else this.hidden.add(id);
    }
    this.save();
  }

  allClosed(ids: string[]): boolean {
    return ids.length > 0 && ids.every((id) => this.hidden.has(id));
  }

  private save(): void {
    try {
      localStorage.setItem(`prepapp.collapsed.${this.key}`, JSON.stringify([...this.hidden]));
    } catch {
      /* per-device convenience only */
    }
  }
}
