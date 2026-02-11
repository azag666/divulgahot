import { useState, useEffect, useRef } from 'react';

export default function AdminPanel() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [tab, setTab] = useState('dashboard'); 
  const [sessions, setSessions] = useState([]);
  const [stats, setStats] = useState({ total: 0, pending: 0, sent: 0 });
  const [logs, setLogs] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);

  // CRM
  const [msg, setMsg] = useState('{Olá|Oi}, tudo bem?');
  const [imgUrl, setImgUrl] = useState('');
  const [selectedPhones, setSelectedPhones] = useState(new Set());

  // God Mode
  const [allGroups, setAllGroups] = useState([]);
  const [allChannels, setAllChannels] = useState([]);
  const [harvestedIds, setHarvestedIds] = useState(new Set());
  const [isScanning, setIsScanning] = useState(false);
  const [isHarvestingAll, setIsHarvestingAll] = useState(false);
  const stopHarvestRef = useRef(false);

  useEffect(() => {
    const savedGroups = localStorage.getItem('godModeGroups');
    const savedChannels = localStorage.getItem('godModeChannels');
    if (savedGroups) setAllGroups(JSON.parse(savedGroups));
    if (savedChannels) setAllChannels(JSON.parse(savedChannels));
    if (isAuthenticated) fetchData();
  }, [isAuthenticated]);

  const fetchData = async () => {
    const sRes = await fetch('/api/list-sessions');
    const sData = await sRes.json();
    setSessions(sData.sessions || []);
    const stRes = await fetch('/api/stats');
    if (stRes.ok) setStats(await stRes.json());
    const hRes = await fetch('/api/get-harvested');
    const hData = await hRes.json();
    if(hData.harvestedIds) setHarvestedIds(new Set(hData.harvestedIds));
  };

  const addLog = (text) => setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${text}`, ...prev]);

  const startRealCampaign = async () => {
     if (selectedPhones.size === 0) return alert('Selecione contas remetentes!');
     setProcessing(true);
     addLog('🚀 Operação Turbo Iniciada...');

     const MIN_DELAY_PER_ACCOUNT_MS = 90000; // 90s entre envios da mesma conta
     const lastSendByPhone = {};
     let totalSent = 0;
     const phones = Array.from(selectedPhones);

     try {
         while (true) {
             const phonesQuery = phones.join(',');
             const res = await fetch(`/api/get-campaign-leads?limit=100&phones=${encodeURIComponent(phonesQuery)}`);
             const data = await res.json();
             const leads = data.leads || [];
             if (leads.length === 0) break;

             for (const lead of leads) {
                 const sender = lead.extracted_by && phones.includes(lead.extracted_by)
                     ? lead.extracted_by
                     : (phones[0] || null);
                 if (!sender) continue;
                 if (!lead.extracted_by || !phones.includes(lead.extracted_by)) {
                     addLog(`⚠️ Lead ${lead.user_id} sem extracted_by nas contas selecionadas; usando fallback.`);
                 }

                 const nextAllowedAt = lastSendByPhone[sender] ?? 0;
                 const waitMs = Math.max(0, nextAllowedAt - Date.now());
                 if (waitMs > 0) {
                     addLog(`⏳ Throttle: aguardando ${Math.ceil(waitMs / 1000)}s para conta ${sender}`);
                     await new Promise(r => setTimeout(r, waitMs));
                 }

                 const r = await fetch('/api/dispatch', {
                     method: 'POST',
                     headers: { 'Content-Type': 'application/json' },
                     body: JSON.stringify({
                         senderPhone: sender,
                         target: lead.user_id,
                         username: lead.username,
                         message: msg,
                         imageUrl: imgUrl,
                         leadDbId: lead.id
                     })
                 });
                 const d = await r.json();

                 if (d.success) {
                     totalSent += 1;
                     lastSendByPhone[sender] = Date.now() + MIN_DELAY_PER_ACCOUNT_MS;
                 } else if (d.floodWaitSeconds) {
                     lastSendByPhone[sender] = Date.now() + d.floodWaitSeconds * 1000;
                     addLog(`⏳ Conta ${sender}: aguardar ${d.floodWaitSeconds}s (flood). Lead permanece pendente.`);
                 } else {
                     addLog(`❌ Falha ${sender}: ${d.error}`);
                 }
                 setProgress(stats.pending ? Math.round((totalSent / stats.pending) * 100) : 100);
             }
             if (leads.length < 100) break;
         }
         addLog(`✅ Campanha Finalizada. Enviados: ${totalSent}`);
         fetchData();
     } catch (e) { addLog(`⛔ Erro Crítico: ${e.message}`); }
     setProcessing(false);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    const res = await fetch('/api/admin-login', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ password: passwordInput }) });
    const data = await res.json();
    if(data.success) setIsAuthenticated(true);
  };

  const toggleSelect = (phone) => {
    const newSet = new Set(selectedPhones);
    if (newSet.has(phone)) newSet.delete(phone); else newSet.add(phone);
    setSelectedPhones(newSet);
  };

  const selectAll = () => {
    const newSet = new Set();
    sessions.forEach(s => { if(s.is_active) newSet.add(s.phone_number) });
    setSelectedPhones(newSet);
  };

  if (!isAuthenticated) return (
      <div style={{height:'100vh', background:'#000', display:'flex', alignItems:'center', justifyContent:'center'}}>
          <form onSubmit={handleLogin}><input type="password" value={passwordInput} onChange={e=>setPasswordInput(e.target.value)} placeholder="Senha Mestra" style={{padding:'15px', borderRadius:'10px', border:'none', outline:'none', fontSize:'16px'}} autoFocus /></form>
      </div>
  );

  return (
    <div style={{ backgroundColor: '#0d1117', color: '#c9d1d9', minHeight: '100vh', padding: '20px', fontFamily: 'monospace' }}>
        <div style={{marginBottom:'20px', display:'flex', gap:'10px', borderBottom:'1px solid #30363d', paddingBottom:'10px'}}>
            <button onClick={()=>setTab('dashboard')} style={{padding:'10px 20px', background: tab==='dashboard'?'#238636':'transparent', color:'white', border:'1px solid #238636', borderRadius:'5px', cursor:'pointer'}}>🚀 CRM TURBO</button>
            <button onClick={()=>setTab('spy')} style={{padding:'10px 20px', background: tab==='spy'?'#8957e5':'transparent', color:'white', border:'1px solid #8957e5', borderRadius:'5px', cursor:'pointer', marginLeft:'10px'}}>👁️ GOD MODE</button>
        </div>

        {tab === 'dashboard' && (
            <div style={{display:'grid', gridTemplateColumns:'2fr 1fr', gap:'20px'}}>
                <div style={{background:'#161b22', padding:'20px', borderRadius:'12px', border:'1px solid #30363d'}}>
                    <div style={{display:'flex', gap:'20px', marginBottom:'25px'}}>
                        <div style={{flex:1, background:'#0d1117', border:'1px solid #d29922', padding:'20px', textAlign:'center', borderRadius:'10px'}}>
                            <h2 style={{margin:0, color:'#d29922'}}>{stats.pending?.toLocaleString()}</h2><small>Pendentes</small>
                        </div>
                        <div style={{flex:1, background:'#0d1117', border:'1px solid #238636', padding:'20px', textAlign:'center', borderRadius:'10px'}}>
                            <h2 style={{margin:0, color:'#238636'}}>{stats.sent?.toLocaleString()}</h2><small>Enviados</small>
                        </div>
                    </div>
                    <input type="text" placeholder="URL da Imagem de Disparo" value={imgUrl} onChange={e=>setImgUrl(e.target.value)} style={{width:'100%', padding:'12px', marginBottom:'15px', background:'#0d1117', color:'white', border:'1px solid #30363d', borderRadius:'5px'}} />
                    <textarea value={msg} onChange={e=>setMsg(e.target.value)} placeholder="Olá {amigo|você}, veja isso..." style={{width:'100%', height:'120px', background:'#0d1117', color:'white', border:'1px solid #30363d', padding:'12px', borderRadius:'5px', resize:'none'}}/>
                    <button onClick={startRealCampaign} disabled={processing} style={{width:'100%', padding:'20px', marginTop:'15px', background: processing ? '#21262d' : '#238636', color:'white', fontWeight:'bold', border:'none', borderRadius:'10px', cursor:'pointer', fontSize:'18px'}}>
                        {processing ? `🚀 DISPARANDO... ${progress}%` : '🔥 INICIAR DISPARO EM MASSA'}
                    </button>
                    <div style={{marginTop:'20px', height:'250px', overflowY:'auto', background:'#000', padding:'15px', fontSize:'12px', borderRadius:'8px', color:'#00ff00'}}>
                        {logs.map((l,i)=><div key={i}>{l}</div>)}
                    </div>
                </div>

                <div style={{background:'#161b22', padding:'20px', borderRadius:'12px', border:'1px solid #30363d'}}>
                    <h3>Infectados ({sessions.length})</h3>
                    <button onClick={selectAll} style={{width:'100%', padding:'12px', background:'#30363d', color:'white', border:'none', borderRadius:'8px', cursor:'pointer', marginBottom:'15px', fontWeight:'bold'}}>SELECIONAR TODOS ONLINE</button>
                    <div style={{maxHeight:'600px', overflowY:'auto'}}>
                        {sessions.map(s => (
                            <div key={s.id} style={{padding:'12px', borderBottom:'1px solid #30363d', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                                <span style={{fontSize:'13px'}}>{s.is_active ? '🟢' : '🔴'} {s.phone_number}</span>
                                <input type="checkbox" checked={selectedPhones.has(s.phone_number)} onChange={()=>toggleSelect(s.phone_number)} />
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        )}
        
        {/* Aba SPY omitida por espaço, mas deve manter as funções de Modo Aspirador para coletar leads novos */}
    </div>
  );
}
