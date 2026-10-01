const r = (x: number) => Math.round(x * 100) / 100

export interface OvertimeSplit {
  normal: number
  h125:   number
  h150:   number
}

// Saturday (day 6) → all hours at 150%.
// Other days: up to threshold125 = normal, up to threshold150 = 125%, above = 150%.
export function splitOvertime(
  date: string,
  totalHours: number,
  threshold125: number,
  threshold150: number
): OvertimeSplit {
  if (totalHours <= 0) return { normal: 0, h125: 0, h150: 0 }
  if (new Date(date + 'T12:00:00').getDay() === 6) {
    return { normal: 0, h125: 0, h150: r(totalHours) }
  }
  if (totalHours <= threshold125) return { normal: r(totalHours), h125: 0, h150: 0 }
  if (totalHours <= threshold150) return { normal: r(threshold125), h125: r(totalHours - threshold125), h150: 0 }
  return { normal: r(threshold125), h125: r(threshold150 - threshold125), h150: r(totalHours - threshold150) }
}
