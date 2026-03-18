'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api, clearSession, getUser, setSession } from '@/lib/api';

const slots = ['A','B','C','D','E','F'];
const defaultNames = ['Nojby','Mojda','Badger','Wowi','Gorky','Blazena'];

function moneySigned(value) {
  const amount = Number(value || 0);
  const label = new Intl.NumberFormat('cs-CZ').format(Math.abs(amount));
  return `${amount >= 0 ? '+' : '-'}${label}`;
}

function LoginCard({ onLoggedIn }) {
  const [username, setUsername] = useState('Nojby');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const data = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
        headers: {}
      });
      setSession(data);
      try {
        const sound = new Audio('/login-sound.mp3');
        sound.volume = 0.85;
        await sound.play();
      } catch {}
      onLoggedIn(data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function handleUserChange(value) {
    setUsername(value);
    setPassword(value === 'Nojby' ? '' : value);
  }

  return (
    <div className="card pad" style={{maxWidth: 480, margin:'0 auto'}}>
      <div className="badge">FIFA turnaje</div>
      <div className="title" style={{marginTop: 10}}>Přihlášení</div>
      <div className="subtitle">Login je přes jméno. U hráče <strong>Nojby</strong> se heslo nepředvyplňuje a musí ho zadat ručně. Ostatní hráči mají stejné heslo jako login.</div>
      <form className="col" style={{marginTop: 18}} onSubmit={submit}>
        <select className="select" value={username} onChange={(e)=>handleUserChange(e.target.value)}>
          {defaultNames.map((name)=><option key={name} value={name}>{name}</option>)}
        </select>
        <input className="input" type="password" value={password} placeholder={username === 'Nojby' ? 'Zadej heslo pro Nojby' : 'Heslo'} onChange={(e)=>setPassword(e.target.value)} />
        {error ? <div className="small" style={{color:'var(--danger)'}}>{error}</div> : null}
        <button className="btn primary" disabled={busy}>{busy ? 'Přihlašuji…' : 'Přihlásit'}</button>
      </form>
    </div>
  );
}

function NewTournamentCard({ onCreate }) {
  const [name, setName] = useState(`Turnaj ${new Date().toLocaleDateString('cs-CZ')}`);
  const [buyIn, setBuyIn] = useState(200);
  const [players, setPlayers] = useState(slots.map((slot, i) => ({ slot, name: defaultNames[i] })));
  const [busy, setBusy] = useState(false);

  function changePlayer(slot, value) {
    setPlayers((prev) => prev.map((p) => p.slot === slot ? { ...p, name: value } : p));
  }

  async function createTournament() {
    setBusy(true);
    try {
      const created = await api('/api/tournaments', {
        method: 'POST',
        body: JSON.stringify({ name, buyIn: Number(buyIn) || 0, players })
      });
      onCreate(created);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card pad pageSectionBottomSpace">
      <div className="row" style={{justifyContent:'space-between', alignItems:'flex-start'}}>
        <div>
          <div style={{fontSize:22,fontWeight:800}}>Založit turnaj</div>
          <div className="small">Zde nastavíš nový turnaj. Jména hráčů a buy-in lze později upravit i v detailu turnaje.</div>
        </div>
        <div className="badge">9 zápasů</div>
      </div>
      <div className="grid grid-2" style={{marginTop:12}}>
        <div><div className="small">Název turnaje</div><input className="input" value={name} onChange={(e)=>setName(e.target.value)} /></div>
        <div><div className="small">Buy-in na hráče</div><input className="input" type="number" value={buyIn} onChange={(e)=>setBuyIn(e.target.value)} /></div>
      </div>
      <div className="grid grid-3" style={{marginTop:12}}>
        {players.map((p) => (
          <div key={p.slot} className="teamBlock">
            <div className="small">Slot {p.slot}</div>
            <input className="input" value={p.name} onChange={(e)=>changePlayer(p.slot, e.target.value)} />
          </div>
        ))}
      </div>
      <div className="footerBar">
        <button className="btn primary" onClick={createTournament} disabled={busy}>{busy ? 'Zakládám…' : 'Založit turnaj'}</button>
      </div>
    </div>
  );
}

function TournamentList({ tournaments, loading }) {
  return (
    <div className="card pad pageSectionBottomSpace">
      <div style={{fontSize:22,fontWeight:800}}>Navštívit turnaj</div>
      <div className="small" style={{marginTop:4}}>Vyber uložený turnaj a otevři jeho zápasy, tabulku, finance nebo audit.</div>
      <div className="grid" style={{marginTop:16}}>
        {loading ? <div className="notice">Načítám…</div> : tournaments.map((t) => (
          <Link href={`/tournaments/${t.id}`} key={t.id} className="card pad tournamentLinkCard" style={{display:'block'}}>
            <div className="row" style={{justifyContent:'space-between', alignItems:'flex-start'}}>
              <div>
                <div style={{fontSize:22,fontWeight:800}}>{t.name}</div>
                <div className="small" style={{marginTop:6}}>{t.players.map((p)=>`${p.slot}: ${p.name}`).join(' • ')}</div>
              </div>
              <div className="col" style={{alignItems:'flex-end'}}>
                <span className={`badge statusBadge status-${t.status}`}>{t.status}</span>
                <span className="small">Buy-in {t.buyIn}</span>
              </div>
            </div>
          </Link>
        ))}
        {!loading && tournaments.length === 0 ? <div className="notice">Zatím tu není žádný turnaj.</div> : null}
      </div>
    </div>
  );
}

function StatsCard({ stats, currentUser, loading }) {
  const myStats = useMemo(() => stats.players.find((row) => row.name === currentUser?.name) || null, [stats, currentUser]);

  return (
    <div className="col pageSectionBottomSpace">
      <div className="card pad">
        <div className="row" style={{justifyContent:'space-between', alignItems:'flex-start'}}>
          <div>
            <div className="badge">Stats FC2026</div>
            <div className="title" style={{marginTop:10, fontSize:'clamp(24px, 4vw, 36px)'}}>Přehled uzavřených turnajů</div>
            <div className="subtitle">Sem se propisují jen uzavřené turnaje. Vidíš finance +/- i sportovní výsledky z předchozích turnajů.</div>
          </div>
          <div className="statsHeroTag">Uzavřené turnaje: {stats.overview.closedTournaments || 0}</div>
        </div>
        <div className="grid grid-3" style={{marginTop:16}}>
          <div className="kpi"><div className="label">Uzavřené turnaje</div><div className="value">{stats.overview.closedTournaments || 0}</div></div>
          <div className="kpi"><div className="label">Celkové skóre</div><div className="value">{stats.overview.totalGoals || 0}</div></div>
          <div className="kpi"><div className="label">Finanční bilance</div><div className="value">{moneySigned(stats.overview.totalNet || 0)}</div></div>
        </div>
      </div>

      <div className="grid grid-2">
        <div className="card pad">
          <div style={{fontSize:20,fontWeight:800}}>Moje bilance</div>
          {loading ? <div className="notice" style={{marginTop:12}}>Načítám statistiky…</div> : (
            <div className="grid grid-2" style={{marginTop:12}}>
              <div className="kpi"><div className="label">Turnaje</div><div className="value">{myStats?.tournaments || 0}</div></div>
              <div className="kpi"><div className="label">1. místa</div><div className="value">{myStats?.firstPlaces || 0}</div></div>
              <div className="kpi"><div className="label">Góly</div><div className="value">{(myStats?.goalsFor || 0)}/{(myStats?.goalsAgainst || 0)}</div></div>
              <div className="kpi"><div className="label">Finance +/-</div><div className="value">{moneySigned(myStats?.net || 0)}</div></div>
            </div>
          )}
        </div>

        <div className="card pad">
          <div style={{fontSize:20,fontWeight:800}}>Co tu je</div>
          <div className="statsBulletList" style={{marginTop:12}}>
            <div className="notice">Sportovní výsledky: turnaje, umístění, góly, body, top střelec a top obrana.</div>
            <div className="notice">Finance: čistý výsledek každého hráče jako příjmy minus buy-in a losovačka.</div>
            <div className="notice">Historie: detail každého uzavřeného turnaje po hráčích níže v tabulce.</div>
          </div>
        </div>
      </div>

      <div className="tableWrap card">
        <table>
          <thead>
            <tr><th>Hráč</th><th>Turnaje</th><th>1. místa</th><th>Podia</th><th>Body</th><th>Góly</th><th>Skóre +/-</th><th>Top střelec</th><th>Top obrana</th><th>Finance +/-</th></tr>
          </thead>
          <tbody>
            {stats.players.map((row) => (
              <tr key={row.name} className={row.name === currentUser?.name ? 'highlightRow' : ''}>
                <td><strong className={row.name === currentUser?.name ? 'top' : ''}>{row.name}</strong></td>
                <td>{row.tournaments}</td>
                <td>{row.firstPlaces}</td>
                <td>{row.podiums}</td>
                <td>{row.points}</td>
                <td>{row.goalsFor}:{row.goalsAgainst}</td>
                <td>{row.goalDiff}</td>
                <td>{row.topScorerAwards}</td>
                <td>{row.topDefenseAwards}</td>
                <td>{moneySigned(row.net)}</td>
              </tr>
            ))}
            {!loading && stats.players.length === 0 ? <tr><td colSpan={10}><div className="notice">Zatím nejsou žádné uzavřené turnaje, takže statistiky jsou nulové.</div></td></tr> : null}
          </tbody>
        </table>
      </div>

      <div className="tableWrap card">
        <table>
          <thead>
            <tr><th>Turnaj</th><th>Hráč</th><th>Umístění</th><th>Body</th><th>Góly</th><th>Finanční výsledek</th><th>Aktualizace</th></tr>
          </thead>
          <tbody>
            {stats.history.map((row, index) => (
              <tr key={`${row.tournamentId}-${row.playerName}-${index}`}>
                <td>{row.tournamentName}</td>
                <td>{row.playerName}</td>
                <td>{row.position}{row.sharedPosition ? '*' : ''}</td>
                <td>{row.points}</td>
                <td>{row.goalsFor}:{row.goalsAgainst}</td>
                <td>{moneySigned(row.net)}</td>
                <td>{new Date(row.updatedAt).toLocaleDateString('cs-CZ')}</td>
              </tr>
            ))}
            {!loading && stats.history.length === 0 ? <tr><td colSpan={7}><div className="notice">Historie je zatím prázdná.</div></td></tr> : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function HomeBottomNav({ activeView, onChange }) {
  return (
    <div className="bottomNavWrap">
      <div className="bottomNav bottomNav3 card">
        <button className={`bottomNavItem ${activeView === 'stats' ? 'active' : ''}`} onClick={() => onChange('stats')}>
          <span className="bottomNavTitle">Stats FC2026</span>
          <span className="bottomNavHint">Uzavřené turnaje</span>
        </button>
        <button className={`bottomNavItem ${activeView === 'create' ? 'active' : ''}`} onClick={() => onChange('create')}>
          <span className="bottomNavTitle">Založit turnaj</span>
          <span className="bottomNavHint">Nový turnaj</span>
        </button>
        <button className={`bottomNavItem ${activeView === 'visit' ? 'active' : ''}`} onClick={() => onChange('visit')}>
          <span className="bottomNavTitle">Navštívit turnaj</span>
          <span className="bottomNavHint">Uložené turnaje</span>
        </button>
      </div>
    </div>
  );
}

const emptyStats = {
  overview: { closedTournaments: 0, totalNet: 0, totalGoals: 0, totalMatches: 0 },
  players: [],
  history: []
};

export default function HomePage() {
  const [user, setUser] = useState(null);
  const [tournaments, setTournaments] = useState([]);
  const [stats, setStats] = useState(emptyStats);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [activeView, setActiveView] = useState('stats');

  async function loadTournaments() {
    setLoading(true);
    try {
      const data = await api('/api/tournaments');
      setTournaments(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function loadStats() {
    setStatsLoading(true);
    try {
      const data = await api('/api/stats');
      setStats(data);
    } catch (err) {
      console.error(err);
      setStats(emptyStats);
    } finally {
      setStatsLoading(false);
    }
  }

  useEffect(() => {
    const current = getUser();
    if (current) {
      setUser(current);
      loadTournaments();
      loadStats();
    }
  }, []);

  if (!user) {
    return (
      <main className="page">
        <div className="shell" style={{paddingTop: 32}}>
          <LoginCard onLoggedIn={(u) => { setUser(u); loadTournaments(); loadStats(); }} />
        </div>
      </main>
    );
  }

  return (
    <main className="page">
      <button className="btn ghost logoutFloating" onClick={() => { clearSession(); location.reload(); }}>Odhlásit</button>

      <div className="shell col">
        {activeView === 'stats' ? <StatsCard stats={stats} currentUser={user} loading={statsLoading} /> : null}

        {activeView === 'create' ? (
          <NewTournamentCard onCreate={(created) => {
            setTournaments((prev)=>[created, ...prev]);
            setActiveView('visit');
          }} />
        ) : null}

        {activeView === 'visit' ? <TournamentList tournaments={tournaments} loading={loading} /> : null}
      </div>

      <HomeBottomNav activeView={activeView} onChange={setActiveView} />
    </main>
  );
}
