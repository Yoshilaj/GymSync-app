/**
 * Unit conversions at the API boundary. The server stores anthropometrics in
 * canonical metric (height_cm / weight_kg); collection UIs work in whichever
 * units the user picked and convert here.
 */

const KG_PER_LB = 0.45359237;
const CM_PER_IN = 2.54;

export function lbsToKg(lbs: number): number {
  return Math.round(lbs * KG_PER_LB * 10) / 10;
}

export function kgToLbs(kg: number): number {
  return Math.round((kg / KG_PER_LB) * 10) / 10;
}

export function ftInToCm(feet: number, inches: number): number {
  return Math.round((feet * 12 + inches) * CM_PER_IN);
}

export function cmToFtIn(cm: number): { feet: number; inches: number } {
  const totalIn = Math.round(cm / CM_PER_IN);
  return { feet: Math.floor(totalIn / 12), inches: totalIn % 12 };
}

export function formatHeight(cm: number, units: 'lbs' | 'kg'): string {
  if (units === 'kg') return `${Math.round(cm)} cm`;
  const { feet, inches } = cmToFtIn(cm);
  return `${feet}'${inches}"`;
}

export function formatWeight(kg: number, units: 'lbs' | 'kg'): string {
  return units === 'kg' ? `${Math.round(kg * 10) / 10} kg` : `${kgToLbs(kg)} lbs`;
}
