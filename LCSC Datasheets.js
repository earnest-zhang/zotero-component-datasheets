{
	"translatorID": "c3b6fdf9-8b29-4c79-80d0-7a702e7bbf39",
	"label": "LCSC Datasheets",
	"creator": "Component Datasheets contributors",
	"target": "^https?://item\\.szlcsc\\.com/[0-9]+\\.html(?:[?#]|$)",
	"minVersion": "9.0",
	"maxVersion": "",
	"priority": 100,
	"inRepository": false,
	"translatorType": 4,
	"browserSupport": "gcsibv",
	"lastUpdated": "2026-10-17 09:00:00"
}

// SPDX-License-Identifier: AGPL-3.0-or-later

function clean(value) {
	return (value || "").replace(/[\u200B-\u200D\uFEFF]/g, "").replace(/\s+/g, " ").trim();
}

function productURL(url) {
	const match = /^https?:\/\/item\.szlcsc\.com\/([0-9]+)\.html(?:[?#]|$)/.exec(url);
	return match ? `https://item.szlcsc.com/${match[1]}.html` : "";
}

function readDetails(doc) {
	const details = new Map();
	for (const term of doc.querySelectorAll("main dl dt")) {
		const value = term.nextElementSibling;
		if (value && value.tagName.toLowerCase() === "dd") {
			details.set(clean(term.textContent), clean(value.textContent));
		}
	}
	return details;
}

function detectWeb(doc, url) {
	if (!productURL(url)) return false;
	const details = readDetails(doc);
	if (details.get("商品型号") && details.get("商品编号")) return "document";
	const container = doc.querySelector("main") || doc.body;
	if (container) Zotero.monitorDOMChanges(container, { childList: true, subtree: true });
	return false;
}

function pdfURL(doc, baseURL) {
	// Only inspect the current product's download link and preview, not other PDFs on the page.
	for (const [selector, attribute] of [["#item-pdf-down", "href"], ["#myPdfIframe", "src"]]) {
		const value = doc.querySelector(selector)?.getAttribute(attribute);
		if (!value) continue;
		try {
			const url = new URL(value, baseURL);
			if (url.protocol !== "https:" || !/(^|\.)szlcsc\.com$/.test(url.hostname)
				|| !/\.pdf$/i.test(url.pathname) || url.username || url.password) continue;
			url.hash = "";
			return url.href;
		}
		catch (error) {
			Zotero.debug(`LCSC Datasheets: invalid PDF URL: ${error.message}`);
		}
	}
	return "";
}

function readProduct(doc, url) {
	const details = readDetails(doc);
	const parameters = [];
	for (const row of doc.querySelectorAll("#productParamsTabItem tr")) {
		const cells = row.querySelectorAll("td");
		if (cells.length < 2) continue;
		const name = clean(cells[cells.length - 2].textContent);
		const value = clean(cells[cells.length - 1].textContent);
		if (name) parameters.push([name, value]);
	}
	return {
		model: details.get("商品型号") || "",
		brand: details.get("品牌名称") || "",
		code: details.get("商品编号") || "",
		category: parameters.find(([name]) => name === "商品目录")?.[1] || "",
		package: details.get("商品封装") || "",
		description: details.get("描述") || "",
		pdf: pdfURL(doc, url),
		parameters
	};
}

function escapeHTML(value) {
	return String(value).replace(/[&<>"']/g, character => ({
		"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
	}[character]));
}

async function doWeb(doc, url) {
	const sourceURL = productURL(url);
	if (!sourceURL) throw new Error("仅支持立创商城的单个器件详情页。");
	const data = readProduct(doc, sourceURL);
	if (!data.model || !data.brand || !data.code || !data.category || !data.pdf) {
		try {
			// A single request recovers fields not yet rendered in the browser.
			const refreshed = readProduct(await requestDocument(sourceURL), sourceURL);
			if (refreshed.model && refreshed.code
				&& (!data.code || data.code === refreshed.code)
				&& (!data.model || data.model === refreshed.model)) {
				for (const key of Object.keys(data)) {
					if (!data[key] || (Array.isArray(data[key]) && !data[key].length)) data[key] = refreshed[key];
				}
			}
		}
		catch (error) {
			Zotero.debug(`LCSC Datasheets: page refresh failed: ${error.message}`);
		}
	}
	if (!data.model || !data.brand || !data.code || !data.category) {
		throw new Error("未找到完整的商品目录、型号、品牌和编号。请等待页面加载完成后重试。");
	}

	const item = new Zotero.Item("document");
	item.title = `${data.category} ${data.model} Specification`;
	item.type = "Datasheet";
	item.language = "en";
	// Zotero fills an undefined catalog with the translator label, so explicitly suppress it.
	item.libraryCatalog = "";
	item.creators.push({ lastName: data.brand, creatorType: "author", fieldMode: 1 });
	item.archive = "立创商城";
	item.archiveLocation = data.code;
	item.url = sourceURL;
	item.accessDate = "CURRENT_TIMESTAMP";
	item.abstractNote = data.description;
	item.tags = [{ tag: data.category }, { tag: data.brand }];
	item.extra = `型号: ${data.model}`;
	if (data.package) item.extra += `\n封装: ${data.package}`;
	// The companion plugin reads the downloaded PDF's first page to fill an empty date.
	// DOI is intentionally unset; neither the product URL nor PDF URL is a DOI.

	const capturedAt = new Date().toISOString();
	const rows = data.parameters.map(([name, value]) =>
		`<tr><td>${escapeHTML(name)}</td><td>${escapeHTML(value)}</td></tr>`).join("");
	let note = `<h2>器件参数</h2><p>${escapeHTML(item.title)}</p>`
		+ `<p>来源：<a href="${escapeHTML(sourceURL)}">立创商城 ${escapeHTML(data.code)}</a></p>`
		+ `<p>抓取时间（UTC）：${capturedAt}</p>`
		+ `<table><thead><tr><th>属性</th><th>参数值</th></tr></thead><tbody>${rows}</tbody></table>`;
	if (data.pdf) {
		item.attachments.push({
			title: "Datasheet",
			url: data.pdf,
			mimeType: "application/pdf",
			proxy: false
		});
	}
	else {
		note += "<p><strong>未找到可用的数据手册 PDF。</strong>已保存器件信息，请从来源页面检查或补充附件。</p>";
		Zotero.debug("LCSC Datasheets: no PDF found; saved metadata with a warning note.");
	}
	item.notes.push({ note });
	item.complete();
}

/** BEGIN TEST CASES **/
var testCases = [];
/** END TEST CASES **/
