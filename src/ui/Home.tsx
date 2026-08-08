import { useCallback, useMemo, useRef, useState, type DragEvent } from 'react';
import type { BootResult } from '../boot/steps';
import { parseJSON } from '../core/io';
import { Model } from '../core/model';
import { TEMPLATES, type Template } from '../core/templates';
import type { ModelSnapshot } from '../core/types';
import {
  deleteProject,
  duplicateProject,
  emptyTrash,
  listProjects,
  readProject,
  renameProject,
  storageInfo,
  trashProject,
  restoreProject,
  writeProject,
  type ProjectMeta,
  type StorageInfo,
} from '../storage/library';
import { ConfirmDialog, type ConfirmRequest } from './ConfirmDialog';
import { agoText, bytesText } from './format';
import { HomeIcon } from './homeIcons';

export interface OpenRequest {
  id: string | null;
  name: string;
  snapshot: ModelSnapshot;
}

type Section = 'home' | 'projects' | 'trash';
type Layout = 'grid' | 'list';
type Sort = 'recent' | 'name' | 'created';

/** Stats for a standalone snapshot, to write before opening the editor. */
function statsOf(snapshot: ModelSnapshot) {
  const m = new Model();
  m.loadSnapshot(snapshot);
  return { vertices: m.vertices.size, edges: m.edges.size, faces: m.faces().length, area: m.totalArea() };
}

/**
 * Object URL cache for the thumbnails, deliberately kept outside React.
 *
 * The obvious alternative — creating the URLs in an effect and revoking them in
 * its cleanup — does not survive StrictMode, which mounts, unmounts and remounts
 * effects: the cleanup revokes URLs the `<img>` elements are still using and the
 * images break. Here a URL is only revoked when that project gets a different
 * blob, which happens on every re-read from the database.
 */
const thumbUrls = new Map<string, { blob: Blob; url: string }>();

function thumbUrl(p: ProjectMeta): string | undefined {
  if (!p.thumb) return undefined;
  const hit = thumbUrls.get(p.id);
  if (hit?.blob === p.thumb) return hit.url;
  if (hit) URL.revokeObjectURL(hit.url);
  const url = URL.createObjectURL(p.thumb);
  thumbUrls.set(p.id, { blob: p.thumb, url });
  return url;
}

function useThumbs(projects: ProjectMeta[]): Map<string, string> {
  return useMemo(() => {
    const next = new Map<string, string>();
    for (const p of projects) {
      const url = thumbUrl(p);
      if (url) next.set(p.id, url);
    }
    return next;
  }, [projects]);
}

export function Home({ initial, onOpen }: { initial: BootResult; onOpen: (req: OpenRequest) => void }) {
  const [section, setSection] = useState<Section>('home');
  const [projects, setProjects] = useState<ProjectMeta[]>(initial.projects);
  const [trashed, setTrashed] = useState<ProjectMeta[]>(initial.trashed);
  const [layout, setLayout] = useState<Layout>('grid');
  const [sort, setSort] = useState<Sort>('recent');
  const [query, setQuery] = useState('');
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const [storage, setStorage] = useState<StorageInfo>(initial.storage);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const [active, trash, info] = await Promise.all([
      listProjects('active'),
      listProjects('trashed'),
      storageInfo(),
    ]);
    setProjects(active);
    setTrashed(trash);
    setStorage(info);
  }, []);

  const start = useCallback(
    async (name: string, snapshot: ModelSnapshot) => {
      try {
        const meta = await writeProject({ name, snapshot, stats: statsOf(snapshot) });
        onOpen({ id: meta.id, name: meta.name, snapshot });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Não deu para criar o projeto.');
      }
    },
    [onOpen],
  );

  const startTemplate = useCallback(
    (t: Template) => {
      const base = t.id === 'blank' ? 'Casa sem nome' : t.name;
      const taken = new Set(projects.map((p) => p.name));
      let name = base;
      for (let i = 2; taken.has(name); i++) name = `${base} ${i}`;
      void start(name, t.build());
    },
    [projects, start],
  );

  const openExisting = useCallback(
    async (id: string) => {
      const found = await readProject(id);
      if (!found) {
        setError('Esse projeto não está mais na biblioteca.');
        void refresh();
        return;
      }
      onOpen({ id: found.meta.id, name: found.meta.name, snapshot: found.snapshot });
    },
    [onOpen, refresh],
  );

  const importFile = useCallback(
    async (file: File) => {
      try {
        const snapshot = parseJSON(await file.text());
        await start(file.name.replace(/\.(casa|json)$/i, ''), snapshot);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Não deu para ler esse arquivo.');
      }
    },
    [start],
  );

  const commitRename = useCallback(async () => {
    if (!renaming) return;
    const name = renaming.value.trim();
    if (name) await renameProject(renaming.id, name);
    setRenaming(null);
    void refresh();
  }, [renaming, refresh]);

  const list = section === 'trash' ? trashed : projects;
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q ? list.filter((p) => p.name.toLowerCase().includes(q)) : list;
    const sorted = [...filtered];
    if (sort === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    else if (sort === 'created') sorted.sort((a, b) => b.createdAt - a.createdAt);
    else sorted.sort((a, b) => b.updatedAt - a.updatedAt);
    return section === 'home' ? sorted.slice(0, 12) : sorted;
  }, [list, query, sort, section]);

  const thumbs = useThumbs(visible);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void importFile(file);
  };

  const titles: Record<Section, string> = {
    home: 'Início',
    projects: 'Seus projetos',
    trash: 'Lixeira',
  };

  return (
    <div
      className={`home${dragging ? ' home--dropping' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false);
      }}
      onDrop={onDrop}
    >
      <aside className="home__side">
        <div className="home__brand">
          Build <span className="home__brand-weak">my</span> House
          <span className="home__brand-sub">modelagem 3d</span>
        </div>

        <button type="button" className="btn btn--primary home__cta" onClick={() => startTemplate(TEMPLATES[0])}>
          {HomeIcon.plus}
          <span>Novo projeto</span>
        </button>
        <button type="button" className="btn home__cta" onClick={() => fileRef.current?.click()}>
          {HomeIcon.folder}
          <span>Abrir arquivo .casa</span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".casa,.json,application/json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void importFile(file);
            e.target.value = '';
          }}
        />

        <nav className="home__nav">
          {(['home', 'projects', 'trash'] as const).map((id) => (
            <button
              key={id}
              type="button"
              className={`home__navitem${section === id ? ' home__navitem--on' : ''}`}
              onClick={() => setSection(id)}
              aria-current={section === id}
            >
              {HomeIcon[id]}
              <span>{titles[id]}</span>
              {id === 'trash' && trashed.length ? <em className="home__badge">{trashed.length}</em> : null}
            </button>
          ))}
        </nav>

        <div className="home__spacer" />

        <div className="home__storage">
          <div className="home__storage-top">
            <span>Armazenamento local</span>
            <span>{bytesText(storage.usage)}</span>
          </div>
          <div className="home__meter">
            <div
              className="home__meter-fill"
              style={{ width: `${storage.quota ? Math.min(100, (storage.usage / storage.quota) * 100) : 0}%` }}
            />
          </div>
          <p className="home__storage-note">
            {storage.persisted
              ? 'Guardado no navegador desta máquina, marcado como permanente.'
              : 'Guardado no navegador desta máquina. Exporte .casa para ter cópia em disco.'}
          </p>
        </div>
      </aside>

      <main className="home__main">
        <header className="home__head">
          <h1 className="home__title">{titles[section]}</h1>
          <div className="home__tools">
            <label className="home__search">
              {HomeIcon.search}
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filtrar por nome"
                spellCheck={false}
                aria-label="Filtrar projetos"
              />
            </label>
            <select
              className="home__select"
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
              aria-label="Ordenar"
            >
              <option value="recent">Mais recentes</option>
              <option value="name">Nome</option>
              <option value="created">Data de criação</option>
            </select>
            <div className="home__layout">
              {(['grid', 'list'] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  className={`home__layoutbtn${layout === l ? ' home__layoutbtn--on' : ''}`}
                  onClick={() => setLayout(l)}
                  aria-label={l === 'grid' ? 'Ver em grade' : 'Ver em lista'}
                  aria-pressed={layout === l}
                >
                  {HomeIcon[l]}
                </button>
              ))}
            </div>
          </div>
        </header>

        {error ? (
          <div className="home__error" role="alert">
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)}>
              fechar
            </button>
          </div>
        ) : null}

        <div className="home__scroll">
          {section === 'home' ? (
            <section className="home__section">
              <h2 className="home__subtitle">Comece por aqui</h2>
              <div className="starters">
                {TEMPLATES.map((t) => (
                  <button key={t.id} type="button" className="starter" onClick={() => startTemplate(t)}>
                    <span className="starter__art">{HomeIcon.template[t.id]}</span>
                    <span className="starter__name">{t.name}</span>
                    <span className="starter__hint">{t.hint}</span>
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          <section className="home__section">
            <div className="home__sectionhead">
              <h2 className="home__subtitle">
                {section === 'trash' ? 'Na lixeira' : section === 'home' ? 'Recentes' : 'Todos os projetos'}
              </h2>
              {section === 'trash' && trashed.length ? (
                <button
                  type="button"
                  className="btn btn--subtle"
                  onClick={() =>
                    setConfirm({
                      title: 'Esvaziar a lixeira?',
                      body: `${trashed.length} ${trashed.length === 1 ? 'projeto será apagado' : 'projetos serão apagados'} de vez. Isso não tem volta.`,
                      confirmLabel: 'Esvaziar lixeira',
                      danger: true,
                      onConfirm: () => void emptyTrash().then(refresh),
                    })
                  }
                >
                  Esvaziar lixeira
                </button>
              ) : null}
              {section === 'home' && projects.length > 12 ? (
                <button type="button" className="btn btn--subtle" onClick={() => setSection('projects')}>
                  Ver todos ({projects.length})
                </button>
              ) : null}
            </div>

            {visible.length === 0 ? (
              <p className="home__empty">
                {section === 'trash'
                  ? 'A lixeira está vazia.'
                  : query
                    ? 'Nenhum projeto com esse nome.'
                    : 'Nada salvo ainda — escolha um ponto de partida acima.'}
              </p>
            ) : (
              <ul className={`cards cards--${layout}`}>
                {visible.map((p) => (
                  <li key={p.id} className="card">
                    <button
                      type="button"
                      className="card__open"
                      onClick={() => void openExisting(p.id)}
                      disabled={section === 'trash'}
                      aria-label={`Abrir ${p.name}`}
                    >
                      <span className="thumb">
                        {thumbs.get(p.id) ? (
                          <img src={thumbs.get(p.id)} alt="" loading="lazy" />
                        ) : (
                          <span className="thumb__empty">{HomeIcon.cube}</span>
                        )}
                      </span>
                    </button>

                    <div className="card__body">
                      {renaming?.id === p.id ? (
                        <input
                          className="card__rename"
                          value={renaming.value}
                          autoFocus
                          onChange={(e) => setRenaming({ id: p.id, value: e.target.value })}
                          onBlur={() => void commitRename()}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') void commitRename();
                            if (e.key === 'Escape') setRenaming(null);
                          }}
                        />
                      ) : (
                        <button
                          type="button"
                          className="card__name"
                          onClick={() => void openExisting(p.id)}
                          disabled={section === 'trash'}
                        >
                          {p.name}
                        </button>
                      )}
                      <span className="card__meta">
                        {agoText(section === 'trash' ? (p.trashedAt ?? p.updatedAt) : p.updatedAt)}
                        {' · '}
                        {p.stats.faces} {p.stats.faces === 1 ? 'face' : 'faces'} · {p.stats.area.toFixed(1)} m²
                      </span>
                    </div>

                    <div className="card__actions">
                      {section === 'trash' ? (
                        <>
                          <button
                            type="button"
                            className="iconbtn"
                            title="Restaurar"
                            aria-label={`Restaurar ${p.name}`}
                            onClick={() => void restoreProject(p.id).then(refresh)}
                          >
                            {HomeIcon.restore}
                          </button>
                          <button
                            type="button"
                            className="iconbtn iconbtn--danger"
                            title="Excluir de vez"
                            aria-label={`Excluir ${p.name} de vez`}
                            onClick={() =>
                              setConfirm({
                                title: 'Excluir de vez?',
                                body: `“${p.name}” será apagado do navegador. Isso não tem volta — sem um .casa salvo em disco, o projeto se perde.`,
                                confirmLabel: 'Excluir de vez',
                                danger: true,
                                onConfirm: () => void deleteProject(p.id).then(refresh),
                              })
                            }
                          >
                            {HomeIcon.trash}
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="iconbtn"
                            title="Renomear"
                            aria-label={`Renomear ${p.name}`}
                            onClick={() => setRenaming({ id: p.id, value: p.name })}
                          >
                            {HomeIcon.rename}
                          </button>
                          <button
                            type="button"
                            className="iconbtn"
                            title="Duplicar"
                            aria-label={`Duplicar ${p.name}`}
                            onClick={() => void duplicateProject(p.id).then(refresh)}
                          >
                            {HomeIcon.duplicate}
                          </button>
                          <button
                            type="button"
                            className="iconbtn"
                            title="Mover para a lixeira"
                            aria-label={`Mover ${p.name} para a lixeira`}
                            onClick={() =>
                              setConfirm({
                                title: 'Mover para a lixeira?',
                                body: `“${p.name}” sai da lista de projetos. Dá para restaurar depois, pela lixeira.`,
                                confirmLabel: 'Mover para a lixeira',
                                onConfirm: () => void trashProject(p.id).then(refresh),
                              })
                            }
                          >
                            {HomeIcon.trash}
                          </button>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </main>

      {dragging ? <div className="home__drop">Solte o arquivo .casa para abrir</div> : null}

      <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}
