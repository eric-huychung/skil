import { StrictMode, useState, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { ArrowDownToLine, ArrowRight, Check, Folder, HelpCircle, Moon, Plus, Search, Settings2, Sparkles, Sun, Trash2, X } from 'lucide-react'
import './styles.css'

type Tab = 'collections' | 'discover' | 'sync'
type Collection = { name: string; skills: string[] }
const skills = [
  ['React patterns', 'vercel-labs/react-patterns', '12.4k'],
  ['Frontend design', 'anthropic/frontend-design', '8.7k'],
  ['Code review', 'github/awesome-code-review', '7.2k'],
  ['Agentic workflows', 'kiro-dev/agentic-workflows', '5.8k'],
  ['TypeScript mastery', 'microsoft/typescript-skills', '4.9k'],
]

function App() {
  const [theme, setTheme] = useState<'dark'|'light'>('dark')
  const [tab, setTab] = useState<Tab>('collections')
  const [collections, setCollections] = useState<Collection[]>([
    { name: 'My collection', skills: ['React patterns', 'Frontend design'] },
    { name: 'Production', skills: ['Code review'] },
    { name: 'Experiments', skills: [] },
  ])
  const [selected, setSelected] = useState(0)
  const [inbox, setInbox] = useState<string[]>(['Agentic workflows'])
  const [query, setQuery] = useState('')
  const [showHelp, setShowHelp] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [added, setAdded] = useState<string[]>([])

  const filtered = skills.filter(([name, id]) => `${name} ${id}`.toLowerCase().includes(query.toLowerCase()))
  const collection = collections[selected]
  const create = () => { if (!newName.trim()) return; setCollections([...collections, { name: newName.trim(), skills: [] }]); setSelected(collections.length); setNewName(''); setShowCreate(false) }
  const addToInbox = (name: string) => { if (!inbox.includes(name)) setInbox([...inbox, name]); setAdded([...added, name]) }
  const fileSkill = (name: string) => { setCollections(collections.map((c, i) => i === selected && !c.skills.includes(name) ? {...c, skills: [...c.skills, name]} : c)); setInbox(inbox.filter(x => x !== name)) }
  const removeSkill = (name: string) => setCollections(collections.map((c, i) => i === selected ? {...c, skills: c.skills.filter(x => x !== name)} : c))

  return <div className={`app-shell ${theme}-shell`}>
    <header className="topbar"><div className="brand-mark"><span className="brand-glyph"><Sparkles size={16}/></span><strong>ContextKit</strong><span className="beta-pill">BETA</span></div><div className="top-actions"><span className="status-label"><i/> Engine ready</span><button className="icon-button" aria-label="Toggle theme" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? <Sun size={17}/> : <Moon size={17}/>}</button></div></header>
    <div className="workspace"><nav className="rail"><div className="rail-top"><p className="rail-caption">WORKSPACE</p><NavButton active={tab==='sync'} icon={<Settings2/>} label="Sync" onClick={() => setTab('sync')}/><NavButton active={tab==='discover'} icon={<Search/>} label="Discover" onClick={() => setTab('discover')}/><NavButton active={tab==='collections'} icon={<Folder/>} label="Collections" onClick={() => setTab('collections')}/></div><button className="rail-item help-item" onClick={() => setShowHelp(true)}><HelpCircle/><span>Help</span></button></nav>
      {tab === 'sync' && <section className="panel-section single-panel"><p className="eyebrow">Workspace</p><h1>Sync</h1><div className="config-card"><span className="status-dot"/><div><h2>Project folder</h2><p className="project-folder-name">context_kit</p><p className="muted-copy">Connect a folder to read and write that project's .contextkit state.</p><button className="primary-button">Change folder <ArrowRight size={15}/></button></div></div><div className="config-card muted-card"><span className="status-dot"/><div><h2>Config is in dev</h2><p className="muted-copy">Workspace sync and IDE configuration are coming soon.</p></div></div></section>}
      {tab === 'collections' && <><section className="panel-section collections-panel"><div className="section-heading"><div><p className="eyebrow">Workspace</p><h1>Collections</h1></div><button className="outline-button" onClick={() => setShowCreate(true)}><Plus size={15}/> New collection</button></div><div className="collection-list">{collections.map((c, i) => <button key={c.name} className={`collection-card ${selected===i?'selected':''}`} onClick={() => setSelected(i)}><span className="card-title"><Folder size={16}/>{c.name}</span><span className="skill-count">{c.skills.length} {c.skills.length===1?'skill':'skills'} <i/></span></button>)}</div><div className="inbox-list"><div className="subheading"><span>Inbox</span><span className="count-pill">{inbox.length}</span></div>{inbox.map(name => <div className="included-skill" key={name}><span>{name}</span><button className="text-button" onClick={() => fileSkill(name)}>File</button></div>)}</div></section><section className="panel-section detail-panel"><div className="detail-header"><div><p className="eyebrow">Collection / {collection.name}</p><h2>{collection.name}</h2><p className="muted-copy">{collection.skills.length} skills</p></div><button className="icon-button danger" aria-label="Delete collection"><Trash2 size={16}/></button></div><div className="target-row"><span>Target IDE</span><select><option>Cursor</option><option>Claude Code</option><option>Windsurf</option></select></div><div className="active-skills"><div className="subheading"><span>Included skills</span><span className="count-pill">{collection.skills.length}</span></div>{collection.skills.map(name => <div className="included-skill" key={name}><span className="checkmark"><Check size={11}/></span><span>{name}</span><button className="remove-button" onClick={() => removeSkill(name)}><X size={14}/></button></div>)}</div><button className="primary-button export-button"><ArrowDownToLine size={16}/> Export collection</button></section></>}
      {tab === 'discover' && <section className="panel-section library-panel"><div className="section-heading"><div><p className="eyebrow">Discover</p><h1>Find Skills</h1></div><span className="library-count">{filtered.length} available</span></div><label className="search-box"><Search size={16}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search skills"/><button><ArrowRight size={16}/></button></label><div className="filter-row"><button className="active-filter">All time</button><button>Trending</button></div><div className="skill-list">{filtered.map(([name, id, installs], i) => <div className="library-skill" key={id}><span className="skill-rank">{String(i+1).padStart(2,'0')}</span><div className="skill-info"><strong>{name}</strong><span>{id}</span></div><span className="skill-installs">{installs}</span><button className={`add-icon-button ${added.includes(name)?'is-added':''}`} onClick={() => addToInbox(name)}>{added.includes(name)?<Check size={16}/>:<Plus size={16}/>}</button></div>)}</div></section>}
    </div><footer className="footer-bar"><span><i/> Config is in dev</span><span>ContextKit 0.2.2</span></footer>
    {showHelp && <Modal title="How can we help?" onClose={() => setShowHelp(false)}><p className="muted-copy">Sync, export, and search all run through the same CollectionEngine the CLI uses.</p></Modal>}
    {showCreate && <Modal title="Create collection" onClose={() => setShowCreate(false)}><input className="modal-input" autoFocus value={newName} onChange={e => setNewName(e.target.value)} placeholder="Collection name"/><div className="modal-actions"><button className="outline-button" onClick={() => setShowCreate(false)}>Cancel</button><button className="primary-button" onClick={create}>Create collection</button></div></Modal>}
  </div>
}
function NavButton({active, icon, label, onClick}:{active:boolean; icon:ReactNode; label:string; onClick:()=>void}) { return <button className={`rail-item ${active?'active':''}`} onClick={onClick}>{icon}<span>{label}</span></button> }
function Modal({title, onClose, children}:{title:string; onClose:()=>void; children:ReactNode}) { return <div className="modal-backdrop" onClick={onClose}><div className="modal" onClick={e => e.stopPropagation()}><button className="modal-close" onClick={onClose}><X size={17}/></button><p className="eyebrow">ContextKit</p><h2>{title}</h2>{children}</div></div> }

createRoot(document.getElementById('root')!).render(<StrictMode><App/></StrictMode>)
