export type Kind = 'expense' | 'income'

export type Theme = {
  accent: string
  income: string
  expense: string
  background: string
}

export type Settings = {
  displayName: string
  theme: Theme
  cycleDay: number
  /** Daily drinking-water goal in millilitres. */
  waterGoalMl: number
  /** Rest between sets, in seconds. */
  restTimerSec: number
}

export type Category = {
  id: string
  name: string
  kind: Kind
  /** Monthly budget in satang. 0 means no budget was set. */
  budget: number
  position: number
}

export type Transaction = {
  id: string
  kind: Kind
  /** Amount in satang (100 = ฿1). */
  amount: number
  categoryId: string | null
  categoryName: string
  note: string
  occurredAt: number
}

export type MonthSummary = {
  month: string
  income: number
  expense: number
  savings: number
  budgetTotal: number
  budgetUsed: number
}

export type AppData = {
  settings: Settings
  categories: Category[]
  transactions: Transaction[]
  summary: MonthSummary
}

export type TransactionInput = {
  kind: Kind
  amount: number
  categoryId: string | null
  note: string
  occurredAt: number
}

export type CategoryInput = {
  name: string
  kind: Kind
  budget: number
}

export type SettingsInput = {
  displayName?: string
  theme?: Theme
  cycleDay?: number
  waterGoalMl?: number
  restTimerSec?: number
}

export type Unit = 'g' | 'kg' | 'ml' | 'l' | 'piece'
export type BaseUnit = 'g' | 'ml' | 'piece'

export type Ingredient = {
  id: string
  name: string
  /** Quantity bought, in purchaseUnit. */
  purchaseQuantity: number
  purchaseUnit: Unit
  /** Price paid for the whole purchase, in satang. */
  purchasePrice: number
  /** Calculated price in satang for one base unit (g / ml / piece). */
  unitPrice: number
}

export type IngredientInput = {
  name: string
  purchaseQuantity: number
  purchaseUnit: Unit
  purchasePrice: number
}

export type RecipeItem = {
  id: string
  ingredientId: string
  name: string
  /** Quantity used by the recipe, in unit. */
  quantity: number
  unit: Unit
  /** Line cost in satang, calculated from the ingredient price. */
  cost: number
}

export type Recipe = {
  id: string
  name: string
  /** How many servings the whole recipe yields. */
  servings: number
  note: string
  items: RecipeItem[]
  /** Total ingredient cost in satang. */
  cost: number
  costPerServing: number
}

export type RecipeItemInput = {
  ingredientId: string
  quantity: number
  unit: Unit
}

export type RecipeInput = {
  name: string
  servings: number
  note: string
  items: RecipeItemInput[]
}

export type Supplement = {
  id: string
  name: string
  /** Price of the whole container in satang. */
  price: number
  /** Servings (pills, scoops) in the container. */
  servings: number
  costPerServing: number
}

export type SupplementInput = {
  name: string
  price: number
  servings: number
}

export type PlanKind = 'meal' | 'supplement'

export type PlanEntry = {
  id: string
  /** Calendar day key, `YYYY-MM-DD`. */
  day: string
  kind: PlanKind
  refId: string
  name: string
  servings: number
  /** Cost in satang for the servings logged. */
  cost: number
  eaten: boolean
}

export type PlanInput = {
  day: string
  kind: PlanKind
  refId: string
  servings: number
}

export type WaterLog = {
  id: string
  day: string
  amountMl: number
  loggedAt: number
}

export type FoodData = {
  month: string
  ingredients: Ingredient[]
  recipes: Recipe[]
  supplements: Supplement[]
  plan: PlanEntry[]
  water: WaterLog[]
  waterGoalMl: number
}

export type CardioType =
  | 'running'
  | 'cycling'
  | 'swimming'
  | 'walking'
  | 'rowing'
  | 'hiit'
  | 'other'

export type WorkoutKind = 'strength' | 'cardio'

/** One set logged inside a strength workout. */
export type WorkoutSet = {
  id: string
  exercise: string
  /** Weight in kilograms. 0 means bodyweight. */
  weightKg: number
  reps: number
  /** Reps in reserve: 0 = to failure, 10 = easy. */
  rir: number
}

export type WorkoutSetInput = {
  exercise: string
  weightKg: number
  reps: number
  rir: number
}

export type Workout = {
  id: string
  /** Calendar day key, `YYYY-MM-DD`. */
  day: string
  kind: WorkoutKind
  title: string
  note: string
  /** Only set for cardio workouts. */
  cardioType: CardioType | null
  /** Cardio duration in minutes. */
  durationMin: number
  /** Cardio distance in metres. */
  distanceM: number
  sets: WorkoutSet[]
  /** Total weight moved (weight × reps), in kilograms. */
  volume: number
}

export type WorkoutInput = {
  day: string
  kind: WorkoutKind
  title: string
  note: string
  cardioType: CardioType | null
  durationMin: number
  distanceM: number
  sets: WorkoutSetInput[]
}

/** Everything logged about one day: body, sleep and how the day felt. */
export type BodyLog = {
  day: string
  weightKg: number | null
  steps: number | null
  /** Bedtime in minutes after midnight (0-1439). */
  sleepBedMin: number | null
  /** Wake time in minutes after midnight (0-1439). */
  sleepWakeMin: number | null
  /** Energy level for the day, 1-5. */
  energy: number | null
  /** Hunger level for the day, 1-5. */
  hunger: number | null
}

export type BodyInput = BodyLog

export type FitnessData = {
  month: string
  bodyLogs: BodyLog[]
  workouts: Workout[]
}

export type ActivityCategory =
  | 'routine'
  | 'study'
  | 'work'
  | 'health'
  | 'rest'
  | 'other'

/** How an activity reminds the owner. */
export type ReminderMode = 'none' | 'minutes' | 'morning'

export type Activity = {
  id: string
  /** Calendar day key, `YYYY-MM-DD`. */
  day: string
  title: string
  category: ActivityCategory
  /** Start of the activity, in minutes after midnight. */
  startMin: number
  /** End of the activity, in minutes after midnight. */
  endMin: number
  /** Importance from 1 (low) to 5 (highest). */
  priority: number
  reminder: ReminderMode
  /** Minutes ahead of the start, used when reminder is `minutes`. */
  reminderMinutes: number
  /** Whether the activity is drawn on the calendar. */
  shown: boolean
}

export type ActivityInput = Omit<Activity, 'id'>

export type TimeData = {
  from: string
  to: string
  activities: Activity[]
}

/** Today's activities plus whether the morning check-in is done. */
export type TodayData = {
  day: string
  checkedIn: boolean
  activities: Activity[]
}

/** One day inside the combined food + health + fitness report. */
export type ReportDay = {
  day: string
  /** Total water in millilitres. */
  waterMl: number
  /** Cost of the meals and supplements actually eaten, in satang. */
  foodCost: number
  mealsEaten: number
  weightKg: number | null
  steps: number | null
  /** Hours slept, in minutes. */
  sleepMin: number | null
  energy: number | null
  hunger: number | null
  strengthSets: number
  /** Total weight moved in the day, in kilograms. */
  strengthVolume: number
  cardioMin: number
  cardioM: number
}

export type ReportTotals = {
  days: number
  loggedDays: number
  waterMl: number
  waterAvgMl: number
  foodCost: number
  mealsEaten: number
  steps: number
  sleepAvgMin: number | null
  weightStart: number | null
  weightEnd: number | null
  weightChange: number | null
  strengthSets: number
  strengthVolume: number
  cardioMin: number
  cardioM: number
}

export type ReportData = {
  /** First day of the range, `YYYY-MM-DD`. */
  from: string
  /** Last day of the range, `YYYY-MM-DD`, inclusive. */
  to: string
  days: ReportDay[]
  totals: ReportTotals
}

export type Session = {
  user: { sub: string; name?: string; email?: string } | null
  mode: 'local' | 'freebuff' | 'setup'
  database: boolean
}
