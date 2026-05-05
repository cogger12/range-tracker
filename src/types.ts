export type AmmoType = {
  id: string
  name: string
  costPerRound: number
}

export type VisitLine = {
  ammoTypeId: string | null
  label: string
  rounds: number
  costPerRound: number
}

export type RangeVisit = {
  id: string
  date: string
  notes: string
  lines: VisitLine[]
}

export type AppData = {
  ammoTypes: AmmoType[]
  visits: RangeVisit[]
}
