'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  CacheEntrySnapshot,
  CacheLensApiResponse,
  CacheLensEvent,
  CacheLensSnapshot,
  CacheTagSnapshot,
} from '../types/index.js'
import { cacheLensStyles } from './styles.js'

const STORAGE_KEY = 'next-cache-lens:panel-open'
const TABS = ['Overview', 'Entries', 'Tags', 'Events', 'Graph', 'Diagnostics'] as const
type Tab = (typeof TABS)[number]

export interface CacheLensProps {
  endpoint?: string
  enabled?: boolean
  position?: 'bottom-right' | 'bottom-left'
  pollInterval?: number
  theme?: 'system' | 'light' | 'dark'
}

export function CacheLens(props: CacheLensProps): React.ReactNode {
  if (process.env.NODE_ENV === 'production' || props.enabled === false) return null
  return <DevelopmentCacheLens {...props} />
}

function DevelopmentCacheLens({
  endpoint = '/api/cache-lens',
  position = 'bottom-right',
  pollInterval = 1_500,
  theme = 'system',
}: CacheLensProps): React.ReactNode {
  const [open, setOpen] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const [tab, setTab] = useState<Tab>('Overview')
  const [snapshot, setSnapshot] = useState<CacheLensSnapshot>()
  const [error, setError] = useState<string>()
  const [activity, setActivity] = useState(false)
  const [selectedEntry, setSelectedEntry] = useState<string>()
  const panelRef = useRef<HTMLDivElement>(null)
  const lastCursorRef = useRef(0)

  useEffect(() => {
    let active = true
    queueMicrotask(() => {
      if (!active) return
      setOpen(window.localStorage.getItem(STORAGE_KEY) === 'true')
      setHydrated(true)
    })
    return () => {
      active = false
    }
  }, [])

  const updateOpen = useCallback((next: boolean) => {
    setOpen(next)
    window.localStorage.setItem(STORAGE_KEY, String(next))
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && open) {
        updateOpen(false)
        return
      }
      if (event.key.toLowerCase() !== 'l' || !event.shiftKey || !(event.metaKey || event.ctrlKey)) {
        return
      }
      const target = event.target
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
      ) {
        return
      }
      event.preventDefault()
      updateOpen(!open)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, updateOpen])

  const refresh = useCallback(
    async (signal?: AbortSignal): Promise<void> => {
      const cursor = lastCursorRef.current
      const separator = endpoint.includes('?') ? '&' : '?'
      const response = await fetch(`${endpoint}${separator}since=${cursor}&limit=1000`, {
        cache: 'no-store',
        ...(signal ? { signal } : {}),
        headers: { Accept: 'application/json' },
      })
      const payload = (await response.json()) as unknown
      if (!isApiResponse(payload)) throw new Error('Cache Lens returned an invalid response.')
      if (!payload.ok) throw new Error(payload.error.message)
      const next = payload.snapshot
      if (next.cursor > lastCursorRef.current && lastCursorRef.current > 0) {
        setActivity(true)
        window.setTimeout(() => setActivity(false), 900)
      }
      lastCursorRef.current = next.cursor
      setSnapshot((previous) => mergeSnapshots(previous, next))
      setError(undefined)
    },
    [endpoint],
  )

  useEffect(() => {
    if (!open) return
    let controller: AbortController | undefined
    const poll = (): void => {
      if (document.visibilityState !== 'visible') return
      controller?.abort()
      controller = new AbortController()
      void refresh(controller.signal).catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return
        setError(cause instanceof Error ? cause.message : 'Cache Lens could not refresh.')
      })
    }
    const onVisibility = (): void => {
      if (document.visibilityState === 'visible') poll()
    }
    poll()
    const timer = window.setInterval(poll, Math.max(500, pollInterval))
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      controller?.abort()
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [open, pollInterval, refresh])

  useEffect(() => {
    if (open) panelRef.current?.focus()
  }, [open])

  const mutate = useCallback(
    async (operation: Record<string, string>): Promise<void> => {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(operation),
      })
      const payload = (await response.json()) as unknown
      if (!isApiResponse(payload)) throw new Error('Cache Lens returned an invalid response.')
      if (!payload.ok) throw new Error(payload.error.message)
      lastCursorRef.current = payload.snapshot.cursor
      setSnapshot(payload.snapshot)
      setError(undefined)
    },
    [endpoint],
  )

  return (
    <div className="ncl-root" data-position={position} data-theme={theme}>
      <style>{cacheLensStyles}</style>
      {open ? (
        <div
          ref={panelRef}
          className="ncl-panel"
          role="dialog"
          aria-modal="false"
          aria-label="Next Cache Lens developer tools"
          tabIndex={-1}
        >
          <header className="ncl-titlebar">
            <span className="ncl-mark" aria-hidden="true" />
            <span className="ncl-title">Next Cache Lens</span>
            <span className="ncl-subtitle">development</span>
            <span className="ncl-spacer" />
            <span className="ncl-live">Live</span>
            <button
              className="ncl-icon-button"
              type="button"
              aria-label="Refresh cache snapshot"
              title="Refresh"
              onClick={() =>
                void refresh().catch((cause: unknown) => setError(errorMessage(cause)))
              }
            >
              ↻
            </button>
            <button
              className="ncl-icon-button"
              type="button"
              aria-label="Close Cache Lens"
              title="Close (Escape)"
              onClick={() => updateOpen(false)}
            >
              ×
            </button>
          </header>
          <nav className="ncl-tabs" role="tablist" aria-label="Cache Lens sections">
            {TABS.map((item) => (
              <button
                key={item}
                id={`ncl-tab-${item}`}
                className="ncl-tab"
                type="button"
                role="tab"
                aria-selected={tab === item}
                aria-controls="ncl-tabpanel"
                onClick={() => setTab(item)}
              >
                {item}
              </button>
            ))}
          </nav>
          <main
            id="ncl-tabpanel"
            className="ncl-content"
            role="tabpanel"
            aria-labelledby={`ncl-tab-${tab}`}
          >
            {error ? <div className="ncl-error">{error}</div> : null}
            {!snapshot ? (
              <EmptyState
                title="Waiting for cache activity"
                detail="Use a cached route, component, or function."
              />
            ) : (
              <TabContent
                tab={tab}
                snapshot={snapshot}
                {...(selectedEntry ? { selectedEntry } : {})}
                onSelectEntry={(id) => {
                  setSelectedEntry(id)
                  setTab('Entries')
                }}
                onSelectTag={() => setTab('Tags')}
                onRevalidate={(tagName) =>
                  void mutate({ operation: 'revalidate-tag', tag: tagName }).catch(
                    (cause: unknown) => setError(errorMessage(cause)),
                  )
                }
                onReset={() =>
                  void mutate({ operation: 'reset' }).catch((cause: unknown) =>
                    setError(errorMessage(cause)),
                  )
                }
              />
            )}
          </main>
        </div>
      ) : (
        <button
          className="ncl-launcher"
          type="button"
          aria-label="Open Next Cache Lens"
          data-hydrated={hydrated}
          title="Open Cache Lens (Cmd/Ctrl + Shift + L)"
          onClick={() => updateOpen(true)}
        >
          <span className="ncl-activity" data-active={activity} aria-hidden="true" />
          Cache
        </button>
      )}
    </div>
  )
}

interface TabContentProps {
  tab: Tab
  snapshot: CacheLensSnapshot
  selectedEntry?: string
  onSelectEntry(id: string): void
  onSelectTag(tag: string): void
  onRevalidate(tag: string): void
  onReset(): void
}

function TabContent(props: TabContentProps): React.ReactNode {
  switch (props.tab) {
    case 'Overview':
      return <Overview snapshot={props.snapshot} />
    case 'Entries':
      return (
        <Entries
          key={props.selectedEntry ?? 'entries'}
          entries={props.snapshot.entries}
          {...(props.selectedEntry ? { initialSelection: props.selectedEntry } : {})}
          onSelectTag={props.onSelectTag}
        />
      )
    case 'Tags':
      return (
        <Tags
          tags={props.snapshot.tags}
          entries={props.snapshot.entries}
          onRevalidate={props.onRevalidate}
          onSelectEntry={props.onSelectEntry}
        />
      )
    case 'Events':
      return <Events events={props.snapshot.events} onReset={props.onReset} />
    case 'Graph':
      return (
        <Graph
          tags={props.snapshot.tags}
          entries={props.snapshot.entries}
          onSelectEntry={props.onSelectEntry}
          onSelectTag={props.onSelectTag}
        />
      )
    case 'Diagnostics':
      return <Diagnostics snapshot={props.snapshot} />
  }
}

function Overview({ snapshot }: { snapshot: CacheLensSnapshot }): React.ReactNode {
  const { statistics } = snapshot
  const metrics = [
    ['Entries', statistics.entries],
    ['Hit rate', statistics.hitRate === undefined ? 'Unknown' : formatPercent(statistics.hitRate)],
    ['Hits', statistics.hits],
    ['Misses', statistics.misses],
    ['Sets', statistics.sets],
    ['Invalidations', statistics.invalidations],
    ['Active tags', statistics.activeTags],
    ['Events retained', statistics.eventCount],
  ]
  return (
    <section className="ncl-section">
      <div className="ncl-metrics">
        {metrics.map(([label, value]) => (
          <div className="ncl-metric" key={label}>
            <div className="ncl-metric-label">{label}</div>
            <div className="ncl-metric-value">{value}</div>
          </div>
        ))}
      </div>
      <h2 className="ncl-section-heading">Recent activity</h2>
      {snapshot.events.length === 0 ? (
        <EmptyState
          title="No cache activity observed yet"
          detail="Use a cached route, component, or function and activity will appear here."
        />
      ) : (
        <EventTable events={snapshot.events.slice(-12).reverse()} />
      )}
    </section>
  )
}

function Entries({
  entries,
  initialSelection,
  onSelectTag,
}: {
  entries: CacheEntrySnapshot[]
  initialSelection?: string
  onSelectTag(tag: string): void
}): React.ReactNode {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const [tag, setTag] = useState('all')
  const [sort, setSort] = useState('recent')
  const [selected, setSelected] = useState(initialSelection)
  const tagOptions = useMemo(
    () => [...new Set(entries.flatMap((entry) => entry.tags))].sort(),
    [entries],
  )
  const filtered = useMemo(() => {
    const normalized = query.toLowerCase()
    return entries
      .filter(
        (entry) =>
          (status === 'all' || entry.status === status) &&
          (tag === 'all' || entry.tags.includes(tag)) &&
          (!normalized ||
            entry.id.toLowerCase().includes(normalized) ||
            entry.tags.some((item) => item.toLowerCase().includes(normalized))),
      )
      .sort((a, b) => {
        if (sort === 'hits') return b.hitCount - a.hitCount
        if (sort === 'misses') return b.missCount - a.missCount
        return (b.lastAccessedAt ?? b.createdAt ?? 0) - (a.lastAccessedAt ?? a.createdAt ?? 0)
      })
  }, [entries, query, sort, status, tag])
  const detail = entries.find((entry) => entry.id === selected)

  return (
    <section className="ncl-section">
      <div className="ncl-toolbar">
        <input
          className="ncl-input"
          type="search"
          aria-label="Search entries"
          placeholder="Search identifiers or tags"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <select
          className="ncl-select"
          aria-label="Filter by status"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="all">All statuses</option>
          <option value="fresh">Fresh</option>
          <option value="stale">Stale</option>
          <option value="invalidated">Invalidated</option>
          <option value="expired">Expired</option>
          <option value="unknown">Unknown</option>
        </select>
        <select
          className="ncl-select"
          aria-label="Filter by tag"
          value={tag}
          onChange={(event) => setTag(event.target.value)}
        >
          <option value="all">All tags</option>
          {tagOptions.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
        <select
          className="ncl-select"
          aria-label="Sort entries"
          value={sort}
          onChange={(event) => setSort(event.target.value)}
        >
          <option value="recent">Recent access</option>
          <option value="hits">Most hits</option>
          <option value="misses">Most misses</option>
        </select>
      </div>
      {filtered.length === 0 ? (
        <EmptyState
          title="No matching entries"
          detail="Adjust the filters or use a cached part of the application."
        />
      ) : (
        <div className="ncl-split">
          <div className="ncl-table-wrap">
            <table className="ncl-table">
              <thead>
                <tr>
                  <th>Identifier</th>
                  <th>Status</th>
                  <th>Tags</th>
                  <th className="ncl-num">Hits</th>
                  <th className="ncl-num">Misses</th>
                  <th>Last access</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((entry) => (
                  <tr
                    key={entry.id}
                    data-clickable="true"
                    aria-selected={entry.id === selected}
                    onClick={() => setSelected(entry.id)}
                  >
                    <td className="ncl-id">{entry.id}</td>
                    <td>
                      <Status value={entry.status} />
                    </td>
                    <td>
                      {entry.tags.slice(0, 2).map((item) => (
                        <span className="ncl-chip" key={item}>
                          {item}
                        </span>
                      ))}
                      {entry.tags.length > 2 ? ` +${entry.tags.length - 2}` : null}
                    </td>
                    <td className="ncl-num">{entry.hitCount}</td>
                    <td className="ncl-num">{entry.missCount}</td>
                    <td className="ncl-time">{relativeTime(entry.lastAccessedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {detail ? (
            <EntryDetails entry={detail} onSelectTag={onSelectTag} />
          ) : (
            <div className="ncl-details">
              <span className="ncl-time">Select an entry for details.</span>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

function EntryDetails({
  entry,
  onSelectTag,
}: {
  entry: CacheEntrySnapshot
  onSelectTag(tag: string): void
}): React.ReactNode {
  return (
    <aside className="ncl-details" aria-label="Entry details">
      <h3>{entry.id}</h3>
      <dl className="ncl-dl">
        <dt>Status</dt>
        <dd>
          <Status value={entry.status} />
        </dd>
        <dt>Tags</dt>
        <dd>
          {entry.tags.length
            ? entry.tags.map((tag) => (
                <button
                  className="ncl-chip ncl-chip-button"
                  type="button"
                  key={tag}
                  onClick={() => onSelectTag(tag)}
                >
                  {tag}
                </button>
              ))
            : 'None observed'}
        </dd>
        <dt>Hits / misses</dt>
        <dd>
          {entry.hitCount} / {entry.missCount}
        </dd>
        <dt>Sets</dt>
        <dd>{entry.setCount}</dd>
        <dt>Created</dt>
        <dd>{relativeTime(entry.createdAt)}</dd>
        <dt>Last access</dt>
        <dd>{relativeTime(entry.lastAccessedAt)}</dd>
        <dt>Revalidate</dt>
        <dd>{duration(entry.revalidateSeconds)}</dd>
        <dt>Expire</dt>
        <dd>{duration(entry.expireSeconds)}</dd>
        <dt>Invalidated</dt>
        <dd>
          {relativeTime(entry.lastInvalidatedAt)}
          {entry.lastInvalidatedBy ? ` · ${entry.lastInvalidatedBy}` : ''}
        </dd>
        <dt>Source</dt>
        <dd>{entry.sourceLocation ?? entry.source ?? 'Unknown'}</dd>
        <dt>Route</dt>
        <dd>Unknown</dd>
      </dl>
    </aside>
  )
}

function Tags({
  tags,
  entries,
  onRevalidate,
  onSelectEntry,
}: {
  tags: CacheTagSnapshot[]
  entries: CacheEntrySnapshot[]
  onRevalidate(tag: string): void
  onSelectEntry(id: string): void
}): React.ReactNode {
  const [query, setQuery] = useState('')
  const filtered = tags.filter((tag) => tag.name.toLowerCase().includes(query.toLowerCase()))
  const entryMap = new Map(entries.map((entry) => [entry.id, entry]))
  return (
    <section className="ncl-section">
      <div className="ncl-toolbar">
        <input
          className="ncl-input"
          type="search"
          aria-label="Search tags"
          placeholder="Search tags"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      {filtered.length === 0 ? (
        <EmptyState
          title="No tags observed"
          detail="Call cacheTag inside a use cache scope to associate entries."
        />
      ) : (
        <div className="ncl-tag-list">
          {filtered.map((tag) => (
            <div className="ncl-tag-row" key={tag.name}>
              <div>
                <span className="ncl-chip">{tag.name}</span>
                <div>
                  {tag.entryIds.slice(0, 3).map((id) => (
                    <button
                      type="button"
                      className="ncl-chip ncl-chip-button"
                      key={id}
                      onClick={() => onSelectEntry(id)}
                    >
                      {entryMap.get(id)?.id ?? id}
                    </button>
                  ))}
                </div>
              </div>
              <div className="ncl-tag-secondary">
                <span className="ncl-time">Entries</span>
                <br />
                {tag.entryIds.length}
              </div>
              <div className="ncl-tag-secondary">
                <span className="ncl-time">Invalidations</span>
                <br />
                {tag.invalidationCount}
              </div>
              <button
                className="ncl-button ncl-button-primary"
                type="button"
                onClick={() => onRevalidate(tag.name)}
              >
                Revalidate
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function Events({
  events,
  onReset,
}: {
  events: CacheLensEvent[]
  onReset(): void
}): React.ReactNode {
  const [kind, setKind] = useState('all')
  const filtered = events
    .filter((event) => kind === 'all' || event.type === kind)
    .slice()
    .reverse()
  return (
    <section className="ncl-section">
      <div className="ncl-toolbar">
        <select
          className="ncl-select"
          aria-label="Filter event type"
          value={kind}
          onChange={(event) => setKind(event.target.value)}
        >
          <option value="all">All events</option>
          {[...new Set(events.map((event) => event.type))].sort().map((type) => (
            <option key={type}>{type}</option>
          ))}
        </select>
        <span className="ncl-spacer" />
        <button className="ncl-button" type="button" onClick={onReset}>
          Clear history
        </button>
      </div>
      {filtered.length ? (
        <EventTable events={filtered} />
      ) : (
        <EmptyState
          title="No matching events"
          detail="Activity will appear as the cache handler observes it."
        />
      )}
    </section>
  )
}

function EventTable({ events }: { events: CacheLensEvent[] }): React.ReactNode {
  return (
    <div className="ncl-table-wrap">
      <table className="ncl-table">
        <thead>
          <tr>
            <th>Time</th>
            <th>Operation</th>
            <th>Identifier</th>
            <th>Tags</th>
            <th className="ncl-num">Duration</th>
            <th>Source</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event) => (
            <tr key={event.id}>
              <td className="ncl-time">{formatClock(event.timestamp)}</td>
              <td>
                <span className="ncl-event-type" data-kind={event.type}>
                  {event.type}
                </span>
              </td>
              <td className="ncl-id">{event.cacheId ?? '—'}</td>
              <td>
                {event.tags?.map((tag) => (
                  <span className="ncl-chip" key={tag}>
                    {tag}
                  </span>
                )) ?? '—'}
              </td>
              <td className="ncl-num">
                {event.durationMs === undefined ? '—' : `${event.durationMs.toFixed(1)} ms`}
              </td>
              <td>{event.sourceLocation ?? event.source}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Graph({
  tags,
  entries,
  onSelectEntry,
  onSelectTag,
}: {
  tags: CacheTagSnapshot[]
  entries: CacheEntrySnapshot[]
  onSelectEntry(id: string): void
  onSelectTag(tag: string): void
}): React.ReactNode {
  const [filter, setFilter] = useState('')
  const selectedTags = tags
    .filter((tag) => tag.name.toLowerCase().includes(filter.toLowerCase()))
    .slice(0, 12)
  const related = new Set(selectedTags.flatMap((tag) => tag.entryIds))
  const selectedEntries = entries.filter((entry) => related.has(entry.id)).slice(0, 20)
  if (!tags.length)
    return (
      <EmptyState
        title="No relationships observed"
        detail="Relationships appear only when entries carry observed tags."
      />
    )
  return (
    <section className="ncl-section">
      <div className="ncl-toolbar">
        <input
          className="ncl-input"
          type="search"
          aria-label="Filter dependency graph"
          placeholder="Filter graph by tag"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
      </div>
      <div className="ncl-graph">
        <div className="ncl-graph-column">
          <div className="ncl-node">
            <div className="ncl-node-label">Observed operation</div>Tag invalidation / cache set
          </div>
        </div>
        <div className="ncl-graph-arrow">→</div>
        <div className="ncl-graph-column">
          {selectedTags.map((tag) => (
            <div className="ncl-node" key={tag.name}>
              <div className="ncl-node-label">Tag · {tag.entryIds.length} entries</div>
              <button type="button" onClick={() => onSelectTag(tag.name)}>
                {tag.name}
              </button>
            </div>
          ))}
        </div>
        <div className="ncl-graph-arrow">→</div>
        <div className="ncl-graph-column">
          {selectedEntries.map((entry) => (
            <div className="ncl-node" key={entry.id}>
              <div className="ncl-node-label">Cache entry · route unknown</div>
              <button className="ncl-id" type="button" onClick={() => onSelectEntry(entry.id)}>
                {entry.id}
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function Diagnostics({ snapshot }: { snapshot: CacheLensSnapshot }): React.ReactNode {
  return (
    <section className="ncl-section">
      {snapshot.diagnostics.length === 0 ? (
        <EmptyState
          title="No deterministic diagnostics"
          detail="Lens reports only observations supported by collected evidence."
        />
      ) : (
        <div className="ncl-diagnostics">
          {snapshot.diagnostics.map((item, index) => (
            <article
              className="ncl-diagnostic"
              data-severity={item.severity}
              key={`${item.code}-${item.entryId ?? item.tag ?? index}`}
            >
              <div className="ncl-diagnostic-title">{item.title}</div>
              <div className="ncl-diagnostic-description">
                {item.description}
                {item.entryId ? ` · ${item.entryId}` : ''}
                {item.tag ? ` · ${item.tag}` : ''}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

function EmptyState({ title, detail }: { title: string; detail: string }): React.ReactNode {
  return (
    <div className="ncl-empty">
      <strong>{title}</strong>
      <span>{detail}</span>
    </div>
  )
}

function Status({ value }: { value: string }): React.ReactNode {
  return (
    <span className="ncl-status" data-status={value}>
      {value}
    </span>
  )
}

function isApiResponse(value: unknown): value is CacheLensApiResponse {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('ok' in value) ||
    typeof value.ok !== 'boolean'
  )
    return false
  if (value.ok)
    return 'snapshot' in value && typeof value.snapshot === 'object' && value.snapshot !== null
  return 'error' in value && typeof value.error === 'object' && value.error !== null
}

function mergeSnapshots(
  previous: CacheLensSnapshot | undefined,
  next: CacheLensSnapshot,
): CacheLensSnapshot {
  if (!previous || next.events.length === 0)
    return { ...next, events: next.events.length ? next.events : (previous?.events ?? []) }
  const map = new Map(previous.events.map((event) => [event.sequence, event]))
  for (const event of next.events) map.set(event.sequence, event)
  return {
    ...next,
    events: [...map.values()].sort((a, b) => a.sequence - b.sequence).slice(-1_000),
  }
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : 'Cache Lens operation failed.'
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}
function formatClock(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], { hour12: false })
}
function relativeTime(timestamp: number | undefined): string {
  if (timestamp === undefined) return 'Unknown'
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1_000))
  if (seconds < 5) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`
}
function duration(seconds: number | undefined): string {
  if (seconds === undefined) return 'Unknown'
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3_600) return `${Math.round(seconds / 60)}m`
  if (seconds < 86_400) return `${Math.round(seconds / 3_600)}h`
  return `${Math.round(seconds / 86_400)}d`
}
