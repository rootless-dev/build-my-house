/**
 * Minimal wrapper around IndexedDB — just enough to work with promises instead
 * of events. Deliberately no external dependency: the raw API does the job, it
 * is the callback shape that gets in the way.
 *
 * Careful when using it: inside a transaction you may only await promises that
 * come from IndexedDB requests of that same transaction. Awaiting anything else
 * (fetch, timers) lets the transaction auto-commit halfway through.
 */

export function req<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Falha na requisição ao IndexedDB.'));
  });
}

export function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Transação do IndexedDB falhou.'));
    tx.onabort = () => reject(tx.error ?? new Error('Transação do IndexedDB foi abortada.'));
  });
}

export function openDB(
  name: string,
  version: number,
  upgrade: (db: IDBDatabase, oldVersion: number) => void,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('Este navegador não expõe o IndexedDB (janela anônima com armazenamento bloqueado?).'));
      return;
    }
    const request = indexedDB.open(name, version);
    request.onupgradeneeded = (e) => upgrade(request.result, e.oldVersion);
    request.onsuccess = () => {
      // If another tab asks for a newer version, this connection must step aside.
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error ?? new Error('Não deu para abrir o banco local.'));
    request.onblocked = () => reject(new Error('Outra aba do Build my House está segurando o banco local.'));
  });
}
