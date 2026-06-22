import type { LaserPhase } from "@prisma/client";
import { LASER_WAVELENGTHS } from "./validation";

export type LaserReadingInput = {
  wavelengthNm: number;
  calibrated: boolean;
  photonCount: number | null;
  phase: LaserPhase;
};

type LaserReading = LaserReadingInput;

export function validateLaserSessionForm(formData: FormData, skipped: boolean): string | null {
  if (skipped) return null;

  let anyUsed = false;
  for (const nm of LASER_WAVELENGTHS) {
    if (formData.get(`using_${nm}`) !== "on") continue;
    anyUsed = true;

    const already = formData.get(`already_${nm}`) === "on";
    if (already) continue;

    const raw = formData.get(`photon_${nm}`);
    if (raw === null || raw === "") {
      return `Enter a photon count for ${nm} nm, or mark it already calibrated.`;
    }
    if (!Number.isFinite(Number(raw))) {
      return `Enter a valid photon count for ${nm} nm.`;
    }
  }

  if (!anyUsed) {
    return "Select at least one laser you are using this session.";
  }

  return null;
}

export function readLaserSessionReadings(
  formData: FormData,
  phase: LaserPhase,
): LaserReadingInput[] {
  const readings: LaserReadingInput[] = [];
  for (const nm of LASER_WAVELENGTHS) {
    if (formData.get(`using_${nm}`) !== "on") continue;

    const already = formData.get(`already_${nm}`) === "on";
    if (already) {
      readings.push({ wavelengthNm: nm, calibrated: true, photonCount: null, phase });
      continue;
    }

    const raw = formData.get(`photon_${nm}`);
    if (raw === null || raw === "") continue;
    const photonCount = Number(raw);
    if (!Number.isFinite(photonCount)) continue;
    readings.push({ wavelengthNm: nm, calibrated: true, photonCount, phase });
  }
  return readings;
}

export function deriveLaserFlags(readings: LaserReadingInput[]) {
  return {
    laserTurnedOn: readings.some((r) => r.photonCount !== null),
    laserAlreadyOn: readings.some((r) => r.photonCount === null),
  };
}

/** Prefer sign-out readings; fall back to sign-in for each wavelength. */
export function finalLaserReadings(readings: LaserReading[]): LaserReading[] {
  return LASER_WAVELENGTHS.flatMap((nm) => {
    const reading =
      readings.find((r) => r.wavelengthNm === nm && r.phase === "SIGN_OUT") ??
      readings.find((r) => r.wavelengthNm === nm && r.phase === "SIGN_IN");
    return reading ? [reading] : [];
  });
}

export function describeLaserSession(
  readings: LaserReading[],
  skipped: boolean,
): string {
  if (skipped) return "Sign-in skipped";

  const active = finalLaserReadings(readings);
  if (active.length === 0) return "—";

  const withCounts = active.filter((r) => r.photonCount !== null);
  const alreadyOnly = active.filter((r) => r.photonCount === null);

  if (withCounts.length && alreadyOnly.length) {
    const parts: string[] = [];
    if (alreadyOnly.length) {
      parts.push(`${alreadyOnly.map((r) => r.wavelengthNm).join(", ")} nm already calibrated`);
    }
    if (withCounts.length) {
      parts.push(`${withCounts.map((r) => r.wavelengthNm).join(", ")} nm with counts`);
    }
    return parts.join("; ");
  }

  if (withCounts.length) return "Calibrated this session";
  return "Already calibrated";
}

export function laserPhotonSummary(readings: LaserReading[]): string {
  const active = finalLaserReadings(readings).filter((r) => r.calibrated && r.photonCount !== null);
  if (active.length === 0) return "—";
  return active.map((r) => `${r.wavelengthNm} nm (${r.photonCount})`).join(", ");
}

export function laserCountForExport(
  readings: LaserReading[],
  nm: number,
  signInSkipped: boolean,
): string {
  if (signInSkipped) return "Not used";

  const reading =
    readings.find((r) => r.wavelengthNm === nm && r.phase === "SIGN_OUT") ??
    readings.find((r) => r.wavelengthNm === nm && r.phase === "SIGN_IN");

  if (!reading) return "Not used";
  if (reading.photonCount === null) return "Already calibrated";
  return String(reading.photonCount);
}
