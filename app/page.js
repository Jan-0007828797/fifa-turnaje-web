
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api, clearSession, getUser, setSession } from '@/lib/api';

const slots = ['A','B','C','D','E','F'];
const defaultNames = ['Nojby','Mojda','Badger','Wowi','Gorky','Blazena'];

function LoginCard({ onLoggedIn }) {
  const [username, setUsername] = useState('Nojby');
  const [password, setPassword] = useState('Nojby');
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
      onLoggedIn(data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card pad" style={{maxWidth: 480, margin:'0 auto'}}>
      <div className="badge">FIFA turnaje</div>
      <div className="title" style={{marginTop: 10}}>Přihlášení</div>
      <div className="subtitle">Login je přes jméno a stejné heslo. Např. Nojby / Nojby.</div>
      <form className="col" style={{marginTop: 18}} onSubmit={submit}>
        <select className="select" value={username} onChange={(e)=>{setUsername(e.target.value); setPassword(e.target.value);}}>
          {defaultNames.map((name)=><option key={name} value={name}>{name}</option>)}
        </select>
        <input className="input" value={password} onChange={(e)=>setPassword(e.target.value)} />
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
    <div className="card pad">
      <div className="row" style={{justifyContent:'space-between'}}>
        <div>
          <div style={{fontSize:22,fontWeight:800}}>Nový turnaj</div>
          <div className="small">Buy-in a hráče A–F můžeš později měnit.</div>
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

export default function HomePage() {
  const [user, setUser] = useState(null);
  const [tournaments, setTournaments] = useState([]);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => {
    const current = getUser();
    if (current) {
      setUser(current);
      loadTournaments();
    }
  }, []);

  const total = useMemo(() => tournaments.length, [tournaments]);

  if (!user) {
    return (
      <main className="page">
        <div className="shell" style={{paddingTop: 32}}>
          <LoginCard onLoggedIn={(u) => { setUser(u); loadTournaments(); }} />
        </div>
      </main>
    );
  }

  return (
    <main className="page">
      <div className="shell col">
        <div className="card pad">
          <div className="row" style={{justifyContent:'space-between', alignItems:'flex-start'}}>
            <div>
              <div className="badge">Vercel + Railway</div>
              <div className="title" style={{marginTop:10}}>FIFA turnaje</div>
              <div className="subtitle">Přihlášený: <strong>{user.name}</strong>. Všichni vidí všechny turnaje. Audit je jen pro Nojby.</div>
            </div>
            <button className="btn ghost" onClick={() => { clearSession(); location.reload(); }}>Odhlásit</button>
          </div>
          <div className="grid grid-3" style={{marginTop:16}}>
            <div className="kpi"><div className="label">Turnaje</div><div className="value">{total}</div></div>
            <div className="kpi"><div className="label">Formát</div><div className="value">6 hráčů</div></div>
            <div className="kpi"><div className="label">Sdílení</div><div className="value">Živě</div></div>
          </div>
        </div>

        <NewTournamentCard onCreate={(created) => {
          setTournaments((prev)=>[created, ...prev]);
        }} />

        <div className="card pad">
          <div style={{fontSize:22,fontWeight:800}}>Uložené turnaje</div>
          <div className="small" style={{marginTop:4}}>Klikni na turnaj a otevři detail zápasů, tabulku a finance.</div>
          <div className="grid" style={{marginTop:16}}>
            {loading ? <div className="notice">Načítám…</div> : tournaments.map((t) => (
              <Link href={`/tournaments/${t.id}`} key={t.id} className="card pad" style={{display:'block'}}>
                <div className="row" style={{justifyContent:'space-between'}}>
                  <div>
                    <div style={{fontSize:22,fontWeight:800}}>{t.name}</div>
                    <div className="small">{t.players.map((p)=>`${p.slot}: ${p.name}`).join(' • ')}</div>
                  </div>
                  <div className="col" style={{alignItems:'flex-end'}}>
                    <span className="badge">{t.status}</span>
                    <span className="small">Buy-in {t.buyIn}</span>
                  </div>
                </div>
              </Link>
            ))}
            {!loading && tournaments.length === 0 ? <div className="notice">Zatím tu není žádný turnaj.</div> : null}
          </div>
        </div>
      </div>
    </main>
  );
}
