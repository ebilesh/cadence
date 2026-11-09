import { validateNotes } from "./transcription.js";
const DATABASE = "cadence-studio",
  STORE = "sessions";
export function validateSession(record) {
  if (
    record?.version !== 1 ||
    typeof record.id !== "string" ||
    typeof record.name !== "string" ||
    !record.name.trim() ||
    record.name.length > 120 ||
    !Number.isFinite(record.updated)
  )
    throw Error("This saved session is invalid.");
  if (
    record.audio &&
    (!(record.audio instanceof Blob) || record.audio.size > 20 * 1024 * 1024)
  )
    throw Error("The recording is too large to save.");
  if (record.kind === "report") {
    const report = record.report;
    if (
      !report ||
      !Array.isArray(report.notes) ||
      report.notes.length > 600 ||
      !Array.isArray(report.reference) ||
      report.reference.length > 600 ||
      !Array.isArray(report.sections) ||
      !report.counts ||
      JSON.stringify(report).length > 2000000
    )
      throw Error("This saved report is invalid.");
    return record;
  }
  if (
    !Array.isArray(record.notes) ||
    record.notes.length > 2000 ||
    !Array.isArray(record.originalNotes) ||
    !Number.isFinite(record.updated)
  )
    throw Error("This saved session is invalid.");
  if (record.notes.length) validateNotes(record.notes);
  validateNotes(record.originalNotes);
  if (
    record.audio &&
    (!(record.audio instanceof Blob) || record.audio.size > 20 * 1024 * 1024)
  )
    throw Error("The recording is too large to save.");
  return record;
}
function open() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore(STORE, { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(Error("Close other Cadence tabs and try saving again."));
  });
}
async function runTransaction(mode, action) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    let result;
    try {
      const request = action(tx.objectStore(STORE));
      request.onsuccess = () => (result = request.result);
      request.onerror = () => tx.abort();
    } catch (error) {
      db.close();
      reject(error);
      return;
    }
    tx.oncomplete = () => {
      db.close();
      resolve(result);
    };
    tx.onabort = tx.onerror = () => {
      db.close();
      reject(tx.error || Error("Browser storage is unavailable."));
    };
  });
}
// Preserve user action order even while IndexedDB connections are opening.
let queue = Promise.resolve();
function transaction(mode, action) {
  const next = queue.then(() => runTransaction(mode, action));
  queue = next.catch(() => {});
  return next;
}

export async function saveStudioSession(record) {
  validateSession(record);
  await transaction("readwrite", (store) => store.put(record));
  return record;
}
export async function loadStudioSession(id) {
  const record = await transaction("readonly", (store) => store.get(id));
  if (!record) throw Error("This session no longer exists.");
  return validateSession(record);
}
export async function listStudioSessions() {
  const records = await transaction("readonly", (store) => store.getAll());
  return records
    .filter((record) => {
      try {
        validateSession(record);
        return true;
      } catch {
        return false;
      }
    })
    .sort((a, b) => b.updated - a.updated);
}
export async function deleteStudioSession(id) {
  await transaction("readwrite", (store) => store.delete(id));
}
