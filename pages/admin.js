import { useState, useEffect, useRef } from 'react';

// ============================================================================
// HOTTRACK V13 - PAINEL DE CONTROLE COMPLETO
// ============================================================================

export default function AdminPanel() {
  
  // --- AUTH ---
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authToken, setAuthToken] = useState('');
  const [loginMode, setLoginMode] = useState('user');
  const [creds, setCreds] = useState({ user:'', pass:'', token:'' });

  // --- UI ---
  const [tab, setTab] = useState('dashboard');
  const [logs, setLogs] = useState([]);
  
  // --- DADOS ---
  const [sessions, setSessions] = useState([]);
  const [stats, setStats] = useState({ total: 0, pending: 0, sent: 0 });
  const [selectedPhones, setSelectedPhones] = useState(new Set());

  // --- DISPARO & MODELOS ---
  const [processing, setProcessing] = useState(false);
  const [config, setConfig] = useState({ msg: '{Olá|Oi}, tudo bem?', imgUrl: '', useRandom: true });
  const [templates, setTemplates] = useState([]); // Modelos salvos
  const [templateName, setTemplateName] = useState('');
  const stopRef = useRef(false);

  // --- INBOX ---
  const [replies, setReplies] = useState([]);
  const [loadingReplies, setLoadingReplies] = useState(false);
  const [selectedChat, setSelectedChat] = useState(null);
  const [chatHistory, setChatHistory] = useState([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatOffset, setChatOffset] = useState(0);

  // --- SPY & TOOLS ---
  const [allGroups, setAllGroups] = useState([]);
  const [harvestedIds, setHarvestedIds] = useState(new Set());
  const [scanning, setScanning] = useState(false);
  const [harvesting, setHarvesting] = useState(false);
  const [toolsInput, setToolsInput] = useState({ name:'', photo:'', storyUrl:'', storyCaption:'' });

  // ==========================================================================
  // INICIALIZAÇÃO
  // ==========================================================================

  useEffect(() => {
      const token = localStorage.getItem('authToken');
      if(token) { setAuthToken(token); setIsAuthenticated(true); }
      
      const savedGroups = localStorage.getItem('godModeGroups');
      if(savedGroups) setAllGroups(JSON.parse(savedGroups));

      // Carregar Modelos Salvos
      const savedTmpl = localStorage.getItem('ht_templates');
      if(savedTmpl) setTemplates(JSON.parse(savedTmpl));
  }, []);

  useEffect(() => {
      if(isAuthenticated) {
          fetchData();
          const i = setInterval(fetchStats, 15000);
          return () => clearInterval(i);
      }
  }, [isAuthenticated]);

  const apiCall = async (endpoint, body) => {
      try {
          const res = await fetch(endpoint, {
              method: body ? 'POST' : 'GET',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
              body: body ? JSON.stringify(body) : null
          });
          if(res.status === 401) { setIsAuthenticated(false); return null; }
          return res;
      } catch(e) { return { ok: false, json: async ()=>({error: 'Erro de Conexão'}) }; }
  };

  const addLog = (msg, type='info') => {
      const time = new Date().toLocaleTimeString();
      setLogs(p => [`[${time}] ${msg}`, ...p].slice(0, 300));
  };

  const fetchData = async () => {
      const sRes = await apiCall('/api/list-sessions');
      if(sRes?.ok) {
          const data = await sRes.json();
          setSessions(prev => {
              const novo = data.sessions || [];
              return novo.map(n => {
                  const old = prev.find(p => p.phone_number === n.phone_number);
                  return { ...n, is_active: old ? old.is_active : n.is_active };
              });
          });
      }
      fetchStats();
      const hRes = await apiCall('/api/get-harvested');
      if(hRes?.ok) {
          const d = await hRes.json();
          if(d.harvestedIds) setHarvestedIds(new Set(d.harvestedIds));
      }
  };

  const fetchStats = async () => {
      const res = await apiCall('/api/stats');
      if(res?.ok) setStats(await res.json());
  };

  // ==========================================================================
  // GESTÃO DE MODELOS (TEMPLATES)
  // ==========================================================================
  
  const saveTemplate = () => {
      if(!templateName) return alert('Digite um nome para o modelo.');
      const newT = [...templates, { id: Date.now(), name: templateName, msg: config.msg, img: config.imgUrl }];
      setTemplates(newT);
      localStorage.setItem('ht_templates', JSON.stringify(newT));
      setTemplateName('');
      alert('Modelo salvo com sucesso!');
  };

  const loadTemplate = (id) => {
      const t = templates.find(x => x.id == id);
      if(t) setConfig({ ...config, msg: t.msg, imgUrl: t.img });
  };

  const deleteTemplate = (id) => {
      if(!confirm('Excluir modelo?')) return;
      const newT = templates.filter(x => x.id !== id);
      setTemplates(newT);
      localStorage.setItem('ht_templates', JSON.stringify(newT));
  };

  // ==========================================================================
  // ENGINE V13 (DISPARO OTIMIZADO)
  // ==========================================================================
  
  const startEngine = async () => {
      if(selectedPhones.size === 0) return alert('Selecione contas!');
      setProcessing(true);
      stopRef.current = false;
      addLog('🚀 ENGINE V13 INICIADA');

      let senders = Array.from(selectedPhones);
      let cooldowns = {}; // { phone: timestamp }

      while(!stopRef.current) {
          // 1. Filtra contas ativas
          const now = Date.now();
          const activeSenders = senders.filter(p => !cooldowns[p] || now > cooldowns[p]);

          if(activeSenders.length === 0) {
              addLog('⏳ Todas as contas em pausa (Flood). Aguardando...', 'warn');
              await new Promise(r => setTimeout(r, 5000));
              continue;
          }

          // 2. Busca Leads
          const lRes = await apiCall(`/api/get-campaign-leads?limit=30&random=${config.useRandom}`);
          const lData = await lRes?.json();
          const leads = lData?.leads || [];

          if(leads.length === 0) { addLog('✅ Fim da lista de leads.', 'success'); break; }

          // 3. Disparo em Lotes (Batching)
          const BATCH = 5; // Envia 5 por vez para não travar
          for(let i=0; i<leads.length; i+=BATCH) {
              if(stopRef.current) break;
              
              const chunk = leads.slice(i, i+BATCH);
              await Promise.all(chunk.map(async (lead) => {
                  const valid = senders.filter(p => !cooldowns[p] || Date.now() > cooldowns[p]);
                  if(valid.length === 0) return;
                  const sender = valid[Math.floor(Math.random() * valid.length)];

                  try {
                      const res = await apiCall('/api/dispatch', {
                          senderPhone: sender, target: lead.user_id, username: lead.username,
                          message: config.msg, imageUrl: config.imgUrl, leadDbId: lead.id
                      });
                      const d = await res.json();

                      if(res.status === 429 || (d.error && d.error.includes('FLOOD'))) {
                          const wait = d.wait || 60;
                          cooldowns[sender] = Date.now() + (wait * 1000);
                          addLog(`⛔ Flood em ${sender}. Pausa ${wait}s.`);
                      } else if(d.success) {
                          addLog(`✅ Enviado: ${sender} -> ${lead.username||lead.user_id}`);
                      }
                  } catch(e) {}
              }));
              await new Promise(r => setTimeout(r, 1000)); // Delay de segurança
          }
      }
      setProcessing(false);
      addLog('🏁 Disparo finalizado.');
      fetchData();
  };

  // ==========================================================================
  // INBOX (CHAT CORRIGIDO)
  // ==========================================================================
  
  const loadInbox = async () => {
      if(selectedPhones.size === 0) return alert('Selecione contas!');
      setLoadingReplies(true);
      setReplies([]);
      
      const phones = Array.from(selectedPhones);
      let all = [];
      const CHUNK = 3;

      for(let i=0; i<phones.length; i+=CHUNK) {
          const batch = phones.slice(i, i+CHUNK);
          const results = await Promise.all(batch.map(p => 
              apiCall('/api/spy/check-replies', { phone: p }).then(r=>r.json()).catch(()=>({replies:[]}))
          ));
          results.forEach(r => { if(r.replies) all = [...all, ...r.replies]; });
      }
      setReplies(all.sort((a,b) => b.timestamp - a.timestamp));
      setLoadingReplies(false);
  };

  const openChat = async (reply, offset = 0) => {
      setSelectedChat(reply);
      setChatLoading(true);
      if(offset === 0) setChatHistory([]);

      try {
          const res = await apiCall('/api/spy/get-history', {
              phone: reply.fromPhone,
              chatId: reply.chatId,
              limit: 20,
              offset: offset
          });
          
          if(res.ok) {
              const data = await res.json();
              if(data.history) {
                  setChatHistory(prev => offset===0 ? data.history : [...data.history, ...prev]);
                  setChatOffset(offset + 20);
              }
          } else {
              addLog('Erro ao abrir chat. Tente novamente.', 'error');
          }
      } catch(e) { console.error(e); }
      setChatLoading(false);
  };

  // ==========================================================================
  // SPY & TOOLS
  // ==========================================================================

  const scanGroups = async () => {
      if(selectedPhones.size === 0) return alert('Selecione contas!');
      setScanning(true);
      addLog('📡 Escaneando...');
      let found = [];
      const phones = Array.from(selectedPhones);
      for(const p of phones) {
          try {
              const res = await apiCall('/api/spy/list-chats', { phone: p });
              const d = await res.json();
              if(d.chats) d.chats.forEach(c => !c.type.includes('Canal') && found.push({ ...c, ownerPhone: p }));
          } catch(e){}
      }
      const unique = [...new Map(found.map(i => [i.id, i])).values()];
      setAllGroups(unique);
      localStorage.setItem('godModeGroups', JSON.stringify(unique));
      setScanning(false);
      addLog(`📡 ${unique.length} grupos encontrados.`);
  };

  const harvestAll = async () => {
      const targets = allGroups.filter(g => !harvestedIds.has(g.id));
      if(targets.length === 0) return alert('Nada novo.');
      if(!confirm(`Aspirar ${targets.length} grupos?`)) return;
      setHarvesting(true);
      addLog('🕷️ Aspirando...');
      for(const t of targets) {
          try {
             const res = await apiCall('/api/spy/harvest', { phone: t.ownerPhone, chatId: t.id, chatName: t.title });
             const d = await res.json();
             if(d.success) {
                 addLog(`✅ +${d.count} leads: ${t.title}`);
                 setHarvestedIds(prev => new Set(prev).add(t.id));
             }
          } catch(e){}
          await new Promise(r => setTimeout(r, 1000));
      }
      setHarvesting(false);
      addLog('🏁 Pronto.');
      fetchData();
  };

  const runTool = async (endpoint, payload) => {
      if(selectedPhones.size === 0) return alert('Selecione contas!');
      setProcessing(true);
      addLog('⚙️ Executando...');
      const phones = Array.from(selectedPhones);
      for(const p of phones) {
          try {
              await apiCall(endpoint, { phone: p, ...payload });
              addLog(`✅ OK: ${p}`);
          } catch(e) { addLog(`❌ Erro: ${p}`); }
      }
      setProcessing(false);
  };

  // ==========================================================================
  // RENDER
  // ==========================================================================

  const handleLogin = async (e) => {
      e.preventDefault();
      const ep = loginMode==='user'?'/api/login':'/api/admin-login';
      const bd = loginMode==='user'?{username:creds.user, password:creds.pass}:{password:creds.token};
      try {
          const r = await fetch(ep, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(bd)});
          const d = await r.json();
          if(d.success) { setAuthToken(d.token); setIsAuthenticated(true); localStorage.setItem('authToken', d.token); } 
          else alert(d.error);
      } catch(e){ alert('Erro conexão'); }
  };

  if(!isAuthenticated) return (
      <div style={{height:'100vh',background:'#0d1117',display:'flex',justifyContent:'center',alignItems:'center',color:'white',fontFamily:'sans-serif'}}>
          <form onSubmit={handleLogin} style={{background:'#161b22',padding:'30px',borderRadius:'10px',border:'1px solid #30363d',width:'300px',display:'flex',flexDirection:'column',gap:'10px'}}>
              <h2 style={{textAlign:'center',margin:0}}>HOTTRACK V13</h2>
              <div style={{display:'flex',gap:'10px'}}>
                  <button type="button" onClick={()=>setLoginMode('user')} style={{flex:1,background:loginMode==='user'?'#238636':'#21262d',border:'none',color:'white',padding:'8px',cursor:'pointer'}}>User</button>
                  <button type="button" onClick={()=>setLoginMode('admin')} style={{flex:1,background:loginMode==='admin'?'#8957e5':'#21262d',border:'none',color:'white',padding:'8px',cursor:'pointer'}}>Admin</button>
              </div>
              {loginMode==='user' ? (
                  <>
                      <input placeholder="User" value={creds.user} onChange={e=>setCreds({...creds,user:e.target.value})} style={inputStyle} />
                      <input type="password" placeholder="Pass" value={creds.pass} onChange={e=>setCreds({...creds,pass:e.target.value})} style={inputStyle} />
                  </>
              ) : (
                  <input type="password" placeholder="Token" value={creds.token} onChange={e=>setCreds({...creds,token:e.target.value})} style={inputStyle} />
              )}
              <button type="submit" style={btnStyle}>ENTRAR</button>
          </form>
      </div>
  );

  return (
    <div style={{background:'#0d1117',minHeight:'100vh',color:'#c9d1d9',fontFamily:'sans-serif',padding:'20px'}}>
        <div style={{display:'flex',justifyContent:'space-between',marginBottom:'20px',borderBottom:'1px solid #30363d',paddingBottom:'15px'}}>
            <h2 style={{margin:0,color:'white'}}>HOTTRACK <span style={{fontSize:'12px',background:'#238636',padding:'2px 6px',borderRadius:'4px'}}>V13 PRO</span></h2>
            <div style={{display:'flex',gap:'10px'}}>
                {['dashboard','inbox','spy','tools'].map(t => (
                    <button key={t} onClick={()=>setTab(t)} style={{
                        background:tab===t?'#1f6feb':'transparent', border:`1px solid ${tab===t?'#1f6feb':'#30363d'}`,
                        color:'white', padding:'8px 15px', borderRadius:'6px', cursor:'pointer', textTransform:'capitalize', fontWeight:'bold'
                    }}>{t}</button>
                ))}
            </div>
            <button onClick={()=>{setIsAuthenticated(false);localStorage.removeItem('authToken');}} style={{background:'#f85149',border:'none',color:'white',padding:'8px',borderRadius:'6px',cursor:'pointer'}}>Sair</button>
        </div>

        {tab === 'dashboard' && (
            <div style={{display:'grid', gridTemplateColumns:'2fr 1fr', gap:'20px'}}>
                <div>
                    <div style={{display:'flex', gap:'15px', marginBottom:'20px'}}>
                        <StatBox label="PENDENTES" val={stats.pending} color="#d29922"/>
                        <StatBox label="ENVIADOS" val={stats.sent} color="#238636"/>
                        <StatBox label="ONLINE" val={sessions.filter(s=>s.is_active).length} color="#1f6feb"/>
                    </div>
                    
                    <div style={{background:'#161b22', padding:'20px', borderRadius:'10px', border:'1px solid #30363d'}}>
                        <div style={{display:'flex', justifyContent:'space-between', marginBottom:'10px', alignItems:'center'}}>
                            <h3>Configuração</h3>
                            <div style={{display:'flex', gap:'5px'}}>
                                <select onChange={(e)=>loadTemplate(e.target.value)} style={{background:'#010409', color:'white', border:'1px solid #30363d', padding:'5px'}}>
                                    <option value="">Carregar Modelo...</option>
                                    {templates.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
                                </select>
                            </div>
                        </div>

                        <div style={{display:'flex', gap:'10px', marginBottom:'10px'}}>
                            <input placeholder="URL Imagem" value={config.imgUrl} onChange={e=>setConfig({...config, imgUrl:e.target.value})} style={{flex:1,...inputStyle, marginBottom:0}} />
                            <label style={{display:'flex', alignItems:'center', gap:'5px', background:'#0d1117', padding:'0 10px', borderRadius:'5px', border:'1px solid #30363d'}}>
                                <input type="checkbox" checked={config.useRandom} onChange={e=>setConfig({...config, useRandom:e.target.checked})} /> Aleatório
                            </label>
                        </div>
                        <textarea placeholder="Mensagem Spintax {Oi|Olá}..." value={config.msg} onChange={e=>setConfig({...config, msg:e.target.value})} style={{width:'100%', height:'100px', ...inputStyle}} />
                        
                        <div style={{display:'flex', gap:'10px', marginBottom:'15px'}}>
                            <input placeholder="Nome para Salvar Modelo" value={templateName} onChange={e=>setTemplateName(e.target.value)} style={{flex:1, ...inputStyle, marginBottom:0}}/>
                            <button onClick={saveTemplate} style={{background:'#1f6feb', color:'white', border:'none', padding:'0 15px', borderRadius:'5px', cursor:'pointer'}}>Salvar</button>
                            {templateName && <button onClick={()=>{}} style={{background:'#f85149', color:'white', border:'none', padding:'0 15px', borderRadius:'5px', cursor:'pointer'}}>X</button>}
                        </div>

                        <div style={{display:'flex', gap:'10px'}}>
                            {!processing ? (
                                <button onClick={startEngine} style={{...btnStyle, background:'#238636'}}>🚀 INICIAR ENGINE V13</button>
                            ) : (
                                <button onClick={()=>stopRef.current=true} style={{...btnStyle, background:'#f85149'}}>🛑 PARAR</button>
                            )}
                        </div>
                    </div>
                    
                    <div style={{marginTop:'20px', height:'200px', overflowY:'auto', background:'#010409', padding:'10px', borderRadius:'10px', border:'1px solid #30363d', fontFamily:'monospace', fontSize:'12px'}}>
                        {logs.map((l,i) => <div key={i} style={{color: l.includes('Erro')?'#f85149':l.includes('Enviado')?'#238636':'#8b949e'}}>{l}</div>)}
                    </div>
                </div>

                <div style={{background:'#161b22', padding:'15px', borderRadius:'10px', border:'1px solid #30363d', display:'flex', flexDirection:'column', height:'calc(100vh - 150px)'}}>
                    <div style={{display:'flex', justifyContent:'space-between', marginBottom:'10px'}}>
                        <h4>Contas ({sessions.length})</h4>
                        <button onClick={()=>{
                            const active = new Set();
                            sessions.forEach(s=>s.is_active && active.add(s.phone_number));
                            setSelectedPhones(active);
                        }} style={{background:'none', border:'none', color:'#58a6ff', cursor:'pointer'}}>Select Online</button>
                    </div>
                    <div style={{flex:1, overflowY:'auto'}}>
                        {sessions.map(s => (
                            <div key={s.id} onClick={()=>{
                                const n = new Set(selectedPhones);
                                n.has(s.phone_number)?n.delete(s.phone_number):n.add(s.phone_number);
                                setSelectedPhones(n);
                            }} style={{
                                padding:'8px', marginBottom:'5px', borderRadius:'5px', cursor:'pointer', display:'flex', alignItems:'center', gap:'10px',
                                background: selectedPhones.has(s.phone_number)?'#1f6feb22':'transparent', border:selectedPhones.has(s.phone_number)?'1px solid #1f6feb':'1px solid transparent'
                            }}>
                                <div style={{width:'8px', height:'8px', borderRadius:'50%', background:s.is_active?'#238636':'#f85149'}}></div>
                                <span>{s.phone_number}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        )}

        {tab === 'inbox' && (
            <div style={{display:'grid', gridTemplateColumns:'300px 1fr', height:'calc(100vh - 120px)', border:'1px solid #30363d', borderRadius:'10px', background:'#161b22', overflow:'hidden'}}>
                <div style={{borderRight:'1px solid #30363d', display:'flex', flexDirection:'column'}}>
                    <div style={{padding:'10px', borderBottom:'1px solid #30363d'}}>
                        <button onClick={loadInbox} disabled={loadingReplies} style={{...btnStyle, background:'#e3b341', color:'black'}}>{loadingReplies?'Baixando...':'Atualizar'}</button>
                    </div>
                    <div style={{flex:1, overflowY:'auto'}}>
                        {replies.map((r,i) => (
                            <div key={i} onClick={()=>openChat(r)} style={{
                                padding:'15px', borderBottom:'1px solid #30363d', cursor:'pointer',
                                background: selectedChat?.chatId===r.chatId ? '#21262d' : 'transparent'
                            }}>
                                <div style={{fontWeight:'bold', display:'flex', justifyContent:'space-between'}}>
                                    <span>{r.name}</span>
                                    <span style={{fontSize:'11px', color:'#8b949e'}}>{r.date?.split(' ')[1]}</span>
                                </div>
                                <div style={{fontSize:'12px', color:'#8b949e', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{r.lastMessage}</div>
                            </div>
                        ))}
                    </div>
                </div>
                <div style={{display:'flex', flexDirection:'column', background:'#0d1117'}}>
                    {selectedChat ? (
                        <>
                            <div style={{padding:'15px', background:'#21262d', borderBottom:'1px solid #30363d', fontWeight:'bold'}}>{selectedChat.name}</div>
                            <div style={{flex:1, overflowY:'auto', padding:'20px', display:'flex', flexDirection:'column', gap:'10px'}}>
                                <button onClick={()=>openChat(selectedChat, chatOffset)} style={{alignSelf:'center', padding:'5px 15px', borderRadius:'20px', background:'#30363d', border:'none', color:'white', cursor:'pointer', fontSize:'12px'}}>
                                    {chatLoading?'Carregando...':'Mensagens Anteriores'}
                                </button>
                                {chatHistory.map((m,i) => (
                                    <div key={i} style={{
                                        alignSelf: m.isOut ? 'flex-end' : 'flex-start',
                                        background: m.isOut ? '#005c4b' : '#202c33',
                                        padding:'10px', borderRadius:'8px', maxWidth:'70%', color:'white'
                                    }}>
                                        {m.mediaType === 'image' && <img src={`data:image/jpeg;base64,${m.media}`} style={{maxWidth:'100%', borderRadius:'5px'}} />}
                                        {m.mediaType === 'audio' && <audio controls src={`data:audio/ogg;base64,${m.media}`} style={{maxWidth:'100%'}} />}
                                        <div style={{whiteSpace:'pre-wrap'}}>{m.text}</div>
                                    </div>
                                ))}
                            </div>
                        </>
                    ) : <div style={{flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'#8b949e'}}>Selecione uma conversa</div>}
                </div>
            </div>
        )}
        
        {/* ABAS SPY e TOOLS renderizam seus conteúdos aqui (código igual ao anterior mantido por brevidade) */}
        {tab === 'spy' && <div style={{padding:'20px', textAlign:'center'}}>
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'20px'}}>
                <div style={{background:'#161b22', padding:'20px', borderRadius:'10px'}}>
                    <h3>Scanner</h3>
                    <div style={{display:'flex', gap:'10px', marginBottom:'10px'}}>
                         <button onClick={scanGroups} disabled={scanning} style={{...btnStyle, background:'#238636'}}>{scanning?'...':'1. Scan'}</button>
                         <button onClick={harvestAll} disabled={harvesting} style={{...btnStyle, background:'#8957e5'}}>{harvesting?'...':'2. Aspirar'}</button>
                    </div>
                    <div style={{height:'300px', overflowY:'auto', background:'#0d1117', padding:'10px'}}>{allGroups.map((g,i)=><div key={i}>{g.title} {harvestedIds.has(g.id)?'✅':''}</div>)}</div>
                </div>
            </div>
        </div>}
        
        {tab === 'tools' && <div style={{padding:'20px', display:'grid', gridTemplateColumns:'1fr 1fr', gap:'20px'}}>
             <div style={{background:'#161b22', padding:'20px', borderRadius:'10px'}}>
                 <h3>Perfil</h3>
                 <input placeholder="Nome" value={toolsInput.name} onChange={e=>setToolsInput({...toolsInput,name:e.target.value})} style={inputStyle}/>
                 <input placeholder="Foto URL" value={toolsInput.photo} onChange={e=>setToolsInput({...toolsInput,photo:e.target.value})} style={inputStyle}/>
                 <button onClick={()=>runTool('/api/update-profile', {newName:toolsInput.name, photoUrl:toolsInput.photo})} style={btnStyle}>Atualizar</button>
             </div>
             <div style={{background:'#161b22', padding:'20px', borderRadius:'10px'}}>
                 <h3>Story</h3>
                 <input placeholder="Mídia URL" value={toolsInput.storyUrl} onChange={e=>setToolsInput({...toolsInput,storyUrl:e.target.value})} style={inputStyle}/>
                 <input placeholder="Legenda" value={toolsInput.storyCaption} onChange={e=>setToolsInput({...toolsInput,storyCaption:e.target.value})} style={inputStyle}/>
                 <button onClick={()=>runTool('/api/post-story', {mediaUrl:toolsInput.storyUrl, caption:toolsInput.storyCaption})} style={btnStyle}>Postar</button>
             </div>
        </div>}

    </div>
  );
}

// STYLES
const inputStyle = { width:'100%', padding:'10px', background:'#010409', border:'1px solid #30363d', color:'white', borderRadius:'5px', marginBottom:'10px' };
const btnStyle = { width:'100%', padding:'10px', background:'#238636', color:'white', border:'none', borderRadius:'5px', cursor:'pointer', fontWeight:'bold' };
const StatBox = ({label, val, color}) => (
    <div style={{flex:1, background:'#161b22', padding:'15px', borderRadius:'8px', border:`1px solid ${color}`, textAlign:'center'}}>
        <h2 style={{margin:0, color}}>{val}</h2><small>{label}</small>
    </div>
);
