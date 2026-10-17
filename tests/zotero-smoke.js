// Test-only code appended to bootstrap.js in a separate profile; never included in the release XPI.
const productionStartup = startup;
startup = async function (data) {
	const output = PathUtils.join(SMOKE_ROOT, "result.json");
	const normalize = path => path.replace(/\\/g, "/").toLowerCase();
	const check = (condition, message) => { if (!condition) throw new Error(message); };
	try {
		await Zotero.initializationPromise;
		check(normalize(Zotero.DataDirectory.dir) === normalize(PathUtils.join(SMOKE_ROOT, "data")), "Refusing to write outside isolated data directory");
		check(normalize(Services.dirsvc.get("ProfD", Components.interfaces.nsIFile).path) === normalize(PathUtils.join(SMOKE_ROOT, "profile")), "Wrong profile");
		await productionStartup(data);
		setTimeout(async () => {
			try {
				const sample = JSON.parse(await Zotero.File.getContentsAsync(PathUtils.join(SMOKE_SOURCE, "sample-item.json")));
				const pdfURL = sample.attachments[0].url;
				delete sample.attachments; delete sample.notes; delete sample.accessDate;
				const parent = new Zotero.Item("document");
				parent.fromJSON(sample);
				await parent.saveTx();
				const attachment = await Zotero.Attachments.importFromURL({
					url: pdfURL, parentItemID: parent.id, contentType: "application/pdf", title: "Datasheet"
				});
				await queue;
				check(parent.getField("date") === "2018-03-19", "PDF date missing: " + parent.getField("date"));
				check(parent.getField("language") === "en", "Wrong language");
				check(parent.getField("libraryCatalog") === "", "Catalog not empty");
				check(parent.getField("title").endsWith(" Specification"), "Missing title suffix");
				check(parent.getField("DOI") === "", "DOI not empty");
				const manual = new Zotero.Item("document");
				manual.fromJSON(sample); manual.setField("date", "2018-03");
				await manual.saveTx();
				const manualAttachment = await Zotero.Attachments.importFromFile({
					file: PathUtils.join(SMOKE_SOURCE, "C382020-datasheet.pdf"), parentItemID: manual.id, title: "Datasheet"
				});
				manualAttachment.setField("url", pdfURL); await manualAttachment.saveTx();
				await queue;
				check(manual.getField("date") === "2018-03", "Manual date overwritten");
				await Zotero.File.putContentsAsync(output, JSON.stringify({
					passed: true, zoteroVersion: Zotero.version, checkedAt: new Date().toISOString(),
					dataDirectory: Zotero.DataDirectory.dir, result: parent.toJSON(),
					attachmentPath: await attachment.getFilePathAsync(), manualDate: manual.getField("date"),
					translator: Zotero.Translators.get("c3b6fdf9-8b29-4c79-80d0-7a702e7bbf39").lastUpdated,
					browserConnectorClickTested: false
				}, null, 2));
			} catch (error) {
		Zotero.logError(error);
				await Zotero.File.putContentsAsync(output, JSON.stringify({ passed: false, error: String(error), stack: error.stack }));
			} finally {
				Services.startup.quit(Components.interfaces.nsIAppStartup.eAttemptQuit);
			}
		}, 1000);
	} catch (error) {
		Zotero.logError(error);
		await Zotero.File.putContentsAsync(output, JSON.stringify({ passed: false, error: String(error), stack: error.stack }));
		Services.startup.quit(Components.interfaces.nsIAppStartup.eAttemptQuit);
	}
};
