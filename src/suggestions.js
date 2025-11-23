export async function getSuggestions(query) {
  if (!query || !query.trim()) return [];
  try {
    const res = await fetch('https://api.datamuse.com/sug?s=' + encodeURIComponent(query));
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data.map(d => d.word) : [];
  } catch (e) {
    return [];
  }
}
