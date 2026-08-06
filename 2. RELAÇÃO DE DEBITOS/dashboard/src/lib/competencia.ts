/** Formata id MM-YYYY → rótulo MM/YYYY. */
export function formatCompetencia(id: string): string {
  const match = /^(\d{2})-(\d{4})$/.exec(id);
  if (!match) return id;
  return `${match[1]}/${match[2]}`;
}

export function sortCompetencias(ids: string[]): string[] {
  return [...ids].sort((a, b) => {
    const [ma, ya] = a.split("-").map(Number);
    const [mb, yb] = b.split("-").map(Number);
    return ya - yb || ma - mb;
  });
}
