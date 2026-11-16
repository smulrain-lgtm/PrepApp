/**
 * PrepApp data model. Every record is one PouchDB document in a single database.
 *
 * Conflict-avoidance rules (see the build brief):
 * - Stock quantities are never stored. A batch's quantity is the sum of its
 *   append-only `movement` documents, so two devices changing stock offline
 *   simply add movements and never conflict.
 * - Editable records carry `updatedAt`; Stage 4's resolver keeps the newest.
 * - Records are soft-deleted (`deleted: true`), never removed, so a movement
 *   written offline on another device never points at a missing batch.
 */

/** Calendar date as `YYYY-MM-DD`. */
export type IsoDate = string;
/** Timestamp as an ISO 8601 string. */
export type IsoDateTime = string;

/** What one unit of an item contributes to readiness. */
export type Metric =
  | 'water_l' // litres of drinking water
  | 'kcal' // food energy
  | 'pet_food_g' // grams of pet food
  | 'fuel_g' // grams of cooking gas
  | 'med_days' // household-days of medicine cover
  | 'light_days' // household-days of lighting
  | 'none'; // equipment: does not count towards days

export const METRICS: Metric[] = [
  'water_l',
  'kcal',
  'pet_food_g',
  'fuel_g',
  'med_days',
  'light_days',
  'none',
];

export type LocationId = 'garage' | 'indoors' | 'grab_bag' | 'car';

export interface BaseDoc {
  _id: string;
  _rev?: string;
  type: DocType;
  updatedAt: IsoDateTime;
  deleted?: boolean;
}

export type DocType =
  | 'settings'
  | 'category'
  | 'item'
  | 'batch'
  | 'movement'
  | 'checklistSection'
  | 'checklistItem'
  | 'contact'
  | 'infoNote'
  | 'purchase';

export interface Pet {
  id: string;
  name: string;
  kind: 'dog' | 'cat' | 'other';
  /** Dry food per day, grams. */
  foodGPerDay: number;
  /** Drinking water per day, litres. */
  waterLPerDay: number;
}

export interface DailyNeeds {
  waterLPerPerson: number;
  kcalPerPerson: number;
  gasGPerPerson: number;
}

export interface Settings extends BaseDoc {
  type: 'settings';
  people: number;
  pets: Pet[];
  targetDays: number;
  /** ON: expired batches do not count. */
  considerExpiry: boolean;
  /** ON: batches inside the warning window do not count. */
  useSoonAtRisk: boolean;
  /** ON: only stock stored indoors counts (models losing the garage). */
  indoorOnly: boolean;
  /** ON: freeze-sensitive stock stored outdoors does not count. */
  freezing: boolean;
  /** Months before expiry that count as "use soon". */
  warningMonths: number;
  dailyNeeds: DailyNeeds;
  /** Metrics whose days decide the readiness figure. */
  criticalMetrics: Metric[];
  /** Long-term goal in days, shown as a ruler on the dashboard (target stays the minimum). */
  goalDays?: number;
  /**
   * Food past its best-before. exclude: not counted. taper: counted in full for
   * 6 months past the date, then less and less until nothing at 12 months.
   * include: still counted. Older records only have `considerExpiry`.
   */
  pastDateRule?: PastDateRule;
  /** Scenarios only (never saved): count stock kept in this one place, e.g. the grab bags. */
  onlyLocation?: LocationId;
}

export type PastDateRule = 'exclude' | 'taper' | 'include';

export interface Category extends BaseDoc {
  type: 'category';
  name: string;
  icon: string;
  order: number;
  /** Metric new items in this category start with. */
  defaultMetric: Metric;
}

export interface PerUnit {
  metric: Metric;
  /** Amount of the metric in one unit, e.g. 400 kcal or 2 L. */
  amount: number;
  /** True when the amount is a default estimate, not from the label. */
  estimated?: boolean;
}

export interface Item extends BaseDoc {
  type: 'item';
  name: string;
  categoryId: string;
  subCategory?: string;
  /** What one unit is called: pack, bottle, canister, tin... */
  unit: string;
  perUnit: PerUnit;
  location: LocationId;
  supplier?: string;
  notes?: string;
  countsTowardReadiness: boolean;
  /** Water, plain-butane gas and the like: unreliable when stored outdoors in a frost. */
  freezeSensitive: boolean;
}

export interface Batch extends BaseDoc {
  type: 'batch';
  itemId: string;
  /** Best-before date, or null when the pack has none. */
  bestBefore: IsoDate | null;
  addedAt: IsoDateTime;
  note?: string;
}

export type MovementReason = 'added' | 'used' | 'discarded' | 'restocked' | 'correction';

export interface Movement extends BaseDoc {
  type: 'movement';
  batchId: string;
  /** Units added (+) or removed (−). */
  delta: number;
  reason: MovementReason;
  at: IsoDateTime;
  /** Device or person name. */
  by: string;
}

/**
 * How a checklist target grows with the scenario.
 * fixed: amount · people: amount × people · pets: amount × pets · days: amount × days ·
 * people_days: amount × people × days ·
 * water: (people × water per person + Σ pet water) × days (amount ignored) ·
 * pet_food: Σ pet food per day × days, grams (amount ignored)
 */
export type ScaleBy = 'fixed' | 'people' | 'pets' | 'days' | 'people_days' | 'water' | 'pet_food';

export type ChecklistStatus = 'have' | 'check' | 'need';

export interface ChecklistSection extends BaseDoc {
  type: 'checklistSection';
  name: string;
  order: number;
}

export interface ChecklistItem extends BaseDoc {
  type: 'checklistItem';
  name: string;
  sectionId: string;
  order: number;
  target: { amount: number; unit: string; scaleBy: ScaleBy };
  status: ChecklistStatus;
  notes?: string;
  lastChecked?: IsoDate | null;
  checkIntervalDays?: number | null;
}

export interface Contact extends BaseDoc {
  type: 'contact';
  name: string;
  role: string;
  phones: string[];
  notes?: string;
  priority: number;
}

export type InfoSection = 'plan' | 'shutoffs' | 'medical' | 'documents' | 'grabbag';

export interface InfoNote extends BaseDoc {
  type: 'infoNote';
  section: InfoSection;
  title: string;
  body: string;
  /** Behind the app PIN (medical notes). */
  locked: boolean;
  order: number;
  /** A photo is stored as the PouchDB attachment `photo` (shut-offs). */
  hasPhoto?: boolean;
  _attachments?: PouchDB.Core.Attachments;
}

export type PurchaseStatus = 'to_buy' | 'bought';

export interface Purchase extends BaseDoc {
  type: 'purchase';
  name: string;
  category: string;
  quantity: string;
  fillsGap?: string;
  shelfLife?: string;
  status: PurchaseStatus;
  notes?: string;
  order: number;
}

export type AnyDoc =
  | Settings
  | Category
  | Item
  | Batch
  | Movement
  | ChecklistSection
  | ChecklistItem
  | Contact
  | InfoNote
  | Purchase;

/** Everything the screens and the readiness engine need, loaded at once. */
export interface Snapshot {
  settings: Settings;
  categories: Category[];
  items: Item[];
  batches: Batch[];
  movements: Movement[];
  checklistSections: ChecklistSection[];
  checklistItems: ChecklistItem[];
  contacts: Contact[];
  infoNotes: InfoNote[];
  purchases: Purchase[];
}
