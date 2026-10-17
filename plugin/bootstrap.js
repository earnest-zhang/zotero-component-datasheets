// SPDX-License-Identifier: AGPL-3.0-or-later
var observerID;
var active = false;
var parserScope = {};
var pending = new Set();
var processed = new Set();
var queue = Promise.resolve();

function install() {}
function uninstall() {}

async function startup({ rootURI }) {
	active = true;
	await Zotero.initializationPromise;
	if (!active) return;
	Services.scriptloader.loadSubScript(rootURI + "date-parser.js", parserScope);
	const response = await Zotero.HTTP.request("GET", rootURI + "LCSC Datasheets.js", { responseType: "text" });
	const source = response.responseText.replace(/\r\n/g, "\n");
	if (!active) return;
	const headerEnd = source.indexOf("\n}\n") + 2;
	if (headerEnd < 2) throw new Error("LCSC Datasheets: invalid bundled translator");
	const metadata = JSON.parse(source.slice(0, headerEnd));
	await Zotero.Translators.init();
	if (!active) return;
	const existing = Zotero.Translators.get(metadata.translatorID);
	if (!existing || existing.lastUpdated < metadata.lastUpdated) {
		await Zotero.Translators.save(metadata, source.slice(headerEnd));
		await Zotero.Translators.reinit();
	}
	if (!active) return;
	observerID = Zotero.Notifier.registerObserver({
		notify(event, type, ids) {
			if (type !== "item" || !["add", "modify"].includes(event)) return;
			for (const id of ids) schedule(id);
		}
	}, ["item"], "lcsc-datasheet-dates");
}

function schedule(id) {
	if (!active || pending.has(id) || processed.has(id)) return;
	const item = Zotero.Items.get(id);
	if (!item || !item.isPDFAttachment() || !item.parentItemID) return;
	pending.add(id);
	// Do not await work inside a notifier callback: item saves trigger further notifications.
	queue = queue.then(() => fillDate(id)).catch(error => Zotero.logError(error))
		.finally(() => pending.delete(id));
}

async function fillDate(id) {
	if (!active) return;
	const attachment = await Zotero.Items.getAsync(id);
	if (!attachment || attachment.deleted || !attachment.parentItemID) return;
	const parent = await Zotero.Items.getAsync(attachment.parentItemID);
	if (!parent || parent.deleted || parent.itemType !== "document"
		|| parent.getField("archive") !== "立创商城"
		|| !/^https:\/\/item\.szlcsc\.com\/[0-9]+\.html$/.test(parent.getField("url"))
		|| parent.getField("date") || !Zotero.Libraries.get(parent.libraryID).editable) return;
	if (!/^https:\/\/(?:[a-z0-9-]+\.)*szlcsc\.com\//i.test(attachment.getField("url"))) return;
	if (!await attachment.getFilePathAsync()) return;
	// shortcut: only the first page and explicit revision/date context; scanned or ambiguous manuals stay blank.
	const { text } = await Zotero.PDFWorker.getFullText(id, 1);
	const match = parserScope.findDatasheetDate(text || "");
	if (!active) return;
	processed.add(id);
	if (!match) {
		Zotero.debug(`LCSC Datasheets: no unambiguous first-page date for ${attachment.key}`);
		return;
	}
	// Recheck inside the transaction so a user edit during PDF extraction is preserved.
	await Zotero.DB.executeTransaction(async () => {
		if (!active || parent.deleted || attachment.deleted || attachment.parentItemID !== parent.id
			|| parent.getField("date") || !Zotero.Libraries.get(parent.libraryID).editable) return;
		parent.setField("date", match.date);
		const extra = parent.getField("extra");
		parent.setField("extra", `${extra ? extra + "\n" : ""}手册日期来源: PDF 首页（附件 ${attachment.key}）\n日期依据: ${match.evidence}`);
		await parent.save();
	});
}

function shutdown() {
	active = false;
	if (observerID !== undefined) Zotero.Notifier.unregisterObserver(observerID);
	observerID = undefined;
	processed.clear();
	pending.clear();
}
