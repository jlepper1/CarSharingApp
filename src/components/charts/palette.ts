/**
 * Chart colours, checked with the dataviz palette validator (light surface).
 *
 * Cars take the first three categorical slots in the order the cars are
 * listed, so a car keeps its colour in every chart. The three slots pass the
 * colour-blindness checks against each other; a fourth car folds into grey
 * rather than a made-up hue.
 */
export const CAR_COLORS = ['#2a78d6', '#eb6834', '#1baf7a'] as const
export const OTHER_COLOR = '#94a3b8'

export function carColor(index: number): string {
  return index >= 0 && index < CAR_COLORS.length ? CAR_COLORS[index] : OTHER_COLOR
}

/**
 * "Anteil" and "Bezahlt" in the cost chart. Deliberately different hues from
 * the cars, so blue never means two things on the same screen.
 */
export const SHARE_COLOR = '#4a3aa7'
export const PAID_COLOR = '#eda100'
