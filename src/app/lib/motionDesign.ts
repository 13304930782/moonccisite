// Movement roles, tuned for mooncci's existing controls rather than a theme.
export const motionDesign = {
  selectionSpring: { type: 'spring' as const, stiffness: 480, damping: 34, mass: .7 },
  disclosureSpring: { type: 'spring' as const, stiffness: 460, damping: 40, mass: .85 },
  releaseSpring: { type: 'spring' as const, stiffness: 580, damping: 27, mass: .65 },
  surfaceSpring: { type: 'spring' as const, stiffness: 440, damping: 34, mass: .85 },
  imageSettle: { type: 'spring' as const, stiffness: 420, damping: 34, mass: .9 },
  content: { duration: .22, ease: [.16, 1, .3, 1] as [number, number, number, number] },
  opacity: { duration: .13, ease: [.2, 0, .2, 1] as [number, number, number, number] },
  imageEnter: { duration: .3, ease: [.18, .85, .25, 1] as [number, number, number, number] },
  imageExit: { duration: .19, ease: [.3, 0, .5, 1] as [number, number, number, number] },
  press: { duration: .065, ease: [.2, .8, .3, 1] as [number, number, number, number] },
  surfaceExit: { duration: .12, ease: [.3, 0, .6, 1] as [number, number, number, number] },
};
