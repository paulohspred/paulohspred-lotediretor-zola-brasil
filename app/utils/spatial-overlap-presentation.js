function formatNumber(value, maximumFractionDigits) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return number.toLocaleString('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  });
}

export default function presentSpatialOverlap(overlap) {
  if (!overlap) return null;
  const intersectionArea = formatNumber(overlap.intersectionAreaM2, 3);
  const subjectArea = formatNumber(overlap.subjectGeometryAreaM2, 3);
  const ratio = Number(overlap.subjectCoverageRatio);
  if (!intersectionArea || !subjectArea || !Number.isFinite(ratio)) return null;
  const coverage = formatNumber(ratio * 100, 2);
  if (!coverage) return null;
  return {
    intersectionAreaLabel: `${intersectionArea} m²`,
    subjectGeometryAreaLabel: `${subjectArea} m²`,
    coverageLabel: `${coverage}%`,
  };
}
