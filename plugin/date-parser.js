// SPDX-License-Identifier: AGPL-3.0-or-later

function findDatasheetDate(text) {
	const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
	const monthPattern = "(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\\.?";
	const normalized = text.replace(/\u00a0/g, " ").replace(/[–—]/g, "-");
	const candidates = [];

	function add(match, year, month, day) {
		year = Number(year);
		month = Number(month);
		if (year < 1970 || year > new Date().getUTCFullYear() || month < 1 || month > 12) return;
		if (day && (Number(day) < 1 || Number(day) > new Date(Date.UTC(year, month, 0)).getUTCDate())) return;
		const start = Math.max(0, match.index - 90);
		const before = normalized.slice(start, match.index);
		const after = normalized.slice(match.index + match[0].length, match.index + match[0].length + 70);
		const linePrefix = before.split(/\n/).pop();
		if (/(?:©|copyright)\s*(?:\d{4}\s*[-,]\s*)?$/i.test(linePrefix)) return;
		// Prefer the explicitly revised date over the original date in a TI-style date range.
		let score = /(?:revised|updated|revision date|release date|issue date|publication date|发布日期|修订日期)\s*[:：\-]?\s*$/i.test(before) ? 3 : 0;
		if (!score && /\b(?:rev(?:ision)?\.?|date|published|issued)\b/i.test(before + after)) score = 2;
		if (!score) return;
		const date = `${year}-${String(month).padStart(2, "0")}${day ? "-" + String(Number(day)).padStart(2, "0") : ""}`;
		candidates.push({ date, score, evidence: (before + match[0] + after).replace(/\s+/g, " ").trim() });
	}

	const fullMonthFirst = new RegExp(`\\b(${monthPattern})\\s+(\\d{1,2}),?\\s+((?:19|20)\\d{2})\\b`, "gi");
	const dayFirst = new RegExp(`\\b(\\d{1,2})\\s+(${monthPattern})\\s+((?:19|20)\\d{2})\\b`, "gi");
	const monthOnly = new RegExp(`\\b(${monthPattern})\\s+((?:19|20)\\d{2})\\b`, "gi");
	for (const match of normalized.matchAll(fullMonthFirst)) add(match, match[3], months.indexOf(match[1].slice(0, 3).toLowerCase()) + 1, match[2]);
	for (const match of normalized.matchAll(dayFirst)) add(match, match[3], months.indexOf(match[2].slice(0, 3).toLowerCase()) + 1, match[1]);
	for (const match of normalized.matchAll(monthOnly)) {
		if (/\d{1,2}\s+$/.test(normalized.slice(Math.max(0, match.index - 4), match.index))) continue;
		add(match, match[2], months.indexOf(match[1].slice(0, 3).toLowerCase()) + 1);
	}
	for (const match of normalized.matchAll(/\b((?:19|20)\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})日?\b/g)) add(match, match[1], match[2], match[3]);
	if (!candidates.length) return null;
	const topScore = Math.max(...candidates.map(candidate => candidate.score));
	const top = candidates.filter(candidate => candidate.score === topScore);
	if (new Set(top.map(candidate => candidate.date)).size !== 1) return null;
	return top[0];
}
