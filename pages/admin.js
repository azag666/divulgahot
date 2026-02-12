import { useState, useEffect, useRef, useLayoutEffect } from 'react';

// ============================================================================
// HOTTRACK V22 - ULTIMATE FACTORY
// - Interface Limpa e "One-Click"
// - Criação de Grupos em Ciclo (Round-Robin de Contas)
// - Disparo Inicial Automático (Oferta de Boas-vindas)
// - Tabela em Tempo Real dos Ativos Criados
// ============================================================================

export default function AdminPanel() {
  
  // --- AUTENTICAÇÃO ---
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authToken, setAuthToken] = useState('');
  const [loginMode, setLoginMode] = useState('user');
  const [credentials, setCredentials] = useState({ user: '', pass: '', token: '' });

  // --- NAVEGAÇÃO ---
  const [activeTab, setActiveTab] = useState('dashboard');
  const [factoryTab, setFactoryTab] = useState('groups'); // groups | bots
  
  // --- DADOS ---
  const [sessions, setSessions] = useState([]);
  const [stats, setStats] = useState({ total: 0, pending: 0, sent: 0 });
  const [selectedPhones, setSelectedPhones] = useState(new Set());
  const [logs, setLogs] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const stopProcessRef = useRef(false);

  // --- ESTADOS DA FÁBRICA DE GRUPOS ---
  const [groupConfig, setGroupConfig] = useState({
      baseName: 'Grupo Promo VIP',
      amountToCreate: 5,
      leadsPerGroup: 40,
      initialMessage: '',
      mediaUrl: '',
      mediaType: 'text' // text, image, video
  });
  const [createdGroups, setCreatedGroups] = useState([]); // Lista visual dos grupos feitos

  // --- ESTADOS DA FÁBRICA DE BOTS ---
  const [botConfig, setBotConfig] = useState({
      baseName: 'Atendimento',
      amount: 3,
      setPhoto: ''
  });
  const [createdBots, setCreatedBots] = useState([]);

  // --- INBOX ---
  const [replies, setReplies] = useState([]);
  const [selectedChat, setSelectedChat] = useState(null);
  const [chatHistory, setChatHistory] = useState([]);
  const chatListRef = useRef(null);

  // --- SPY ---
  const [allGroups, setAllGroups] = useState([]);

  // ==========================================================================
  // INICIALIZAÇÃO
  // ==========================================================================
  useEffect(() => {
      const token = localStorage.getItem('authToken');
      if (token) { setAuthToken(token); setIsAuthenticated(true); }
      const savedGroups = localStorage.getItem('godModeGroups');
      if (savedGroups) setAllGroups(JSON.parse(savedGroups));
  }, []);

  useEffect(() => {
      if (isAuthenticated) {
          fetchData(); 
          const intervalId = setInterval(fetchData, 4000);
          return () => clearInterval(intervalId);
      }
  }, [isAuthenticated]);

  const fetchData = async () => {
      const t = Date.now();
      try {
          const sRes = await fetch(`/api/list-sessions?t=${t}`, { headers: { 'Authorization': `Bearer ${authToken}` } });
          const sData = await sRes.json();
          if (sData.sessions) setSessions(sData.sessions);

          const stRes = await fetch(`/api/stats?t=${t}`, { headers: { 'Authorization': `Bearer ${authToken}` } });
          const stData = await stRes.json();
          setStats(stData);
      } catch (e) {}
  };

  const addLog = (msg) => {
      const time = new Date().toLocaleTimeString();
      setLogs(prev => [`[${time}] ${msg}`, ...prev].slice(0, 200));
  };

  // ==========================================================================
  // 🏭 ENGINE: FÁBRICA DE GRUPOS (OTIMIZADA)
  // ==========================================================================
  const runGroupFactory = async () => {
      if (selectedPhones.size === 0) return alert('Selecione as contas que criarão os grupos!');
      setIsProcessing(true);
      stopProcessRef.current = false;
      addLog('🚀 INICIANDO CICLO DE CRIAÇÃO DE GRUPOS...');

      const creators = Array.from(selectedPhones);
      let createdCount = 0;

      while (createdCount < groupConfig.amountToCreate && !stopProcessRef.current) {
          // 1. Seleciona Criador (Rodízio)
          const creator = creators[createdCount % creators.length];
          const currentGroupName = `${groupConfig.baseName} #${Math.floor(Math.random() * 9999)}`;

          addLog(`🏗️ (${createdCount + 1}/${groupConfig.amountToCreate}) Criando: ${currentGroupName} via ${creator}...`);

          // 2. Busca Leads Frescos
          let leads = [];
          try {
              const leadRes = await fetch(`/api/get-campaign-leads?limit=${groupConfig.leadsPerGroup}`, { headers: { 'Authorization': `Bearer ${authToken}` } });
              const leadData = await leadRes.json();
              leads = leadData.leads || [];
          } catch (e) { addLog('❌ Erro ao buscar leads.'); }

          if (leads.length === 0) {
              addLog('⚠️ Sem leads disponíveis no banco.');
              break;
          }

          // 3. Executa Criação + Adição + Disparo Inicial
          try {
              const res = await fetch('/api/factory/create-group-blast', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
                  body: JSON.stringify({
                      phone: creator,
                      title: currentGroupName,
                      leads: leads.map(l => l.user_id),
                      initialMessage: groupConfig.initialMessage,
                      mediaUrl: groupConfig.mediaUrl,
                      mediaType: groupConfig.mediaType
                  })
              });
              const data = await res.json();

              if (data.success) {
                  addLog(`✅ Grupo Criado! Link: ${data.inviteLink}`);
                  
                  // Adiciona à lista visual
                  setCreatedGroups(prev => [{
                      name: currentGroupName,
                      link: data.inviteLink,
                      members: leads.length,
                      creator: creator,
                      status: 'Ativo & Disparado'
                  }, ...prev]);

                  // Atualiza Stats Globais
                  setStats(prev => ({ ...prev, sent: prev.sent + leads.length }));
              } else {
                  addLog(`❌ Falha na criação: ${data.error}`);
                  // Se falhar, espera mais tempo antes de tentar o próximo
                  await new Promise(r => setTimeout(r, 10000));
              }

          } catch (e) { console.error(e); }

          createdCount++;
          // Delay de segurança entre grupos para não banir a conta
          await new Promise(r => setTimeout(r, 20000)); 
      }

      setIsProcessing(false);
      addLog('🏁 Ciclo de Grupos Finalizado.');
  };

  // ==========================================================================
  // 🤖 ENGINE: FÁBRICA DE BOTS (SIMPLIFICADA)
  // ==========================================================================
  const runBotFactory = async () => {
      if (selectedPhones.size === 0) return alert('Selecione uma conta para falar com o BotFather!');
      const creator = Array.from(selectedPhones)[0];
      
      setIsProcessing(true);
      addLog('🤖 Iniciando conversas com @BotFather...');

      for (let i = 0; i < botConfig.amount; i++) {
          const suffix = Math.floor(Math.random() * 99999);
          const name = `${botConfig.baseName} ${suffix}`;
          const username = `${botConfig.baseName.replace(/\s+/g,'')}_${suffix}_bot`;

          addLog(`⚙️ Criando bot: @${username}...`);

          try {
              const res = await fetch('/api/factory/create-bot', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
                  body: JSON.stringify({
                      phone: creator,
                      name: name,
                      username: username,
                      photoUrl: botConfig.setPhoto
                  })
              });
              const data = await res.json();

              if (data.success) {
                  addLog(`✅ Bot Criado! Token: ${data.token}`);
                  setCreatedBots(prev => [{ username, token: data.token }, ...prev]);
              } else {
                  addLog(`❌ Erro BotFather: ${data.error}`);
              }
          } catch (e) {}

          await new Promise(r => setTimeout(r, 8000)); // BotFather exige pausas
      }
      setIsProcessing(false);
      addLog('🏁 Bots criados.');
  };

  // ==========================================================================
  // INBOX & SPY (Lógica Auxiliar)
  // ==========================================================================
  const loadInbox = async () => {
    if(selectedPhones.size===0) {
        const active = sessions.filter(s=>s.is_active).map(s=>s.phone_number);
        if(active.length>0) setSelectedPhones(new Set(active));
    }
    const phones = Array.from(selectedPhones.size > 0 ? selectedPhones : sessions.map(s=>s.phone_number));
    let all = [];
    for(const p of phones) {
        const r = await fetch('/api/spy/check-replies', { method:'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` }, body: JSON.stringify({phone:p})});
        const d = await r.json();
        if(d.replies) all.push(...d.replies);
    }
    setReplies(all);
  };

  const openChat = async (r) => {
      setSelectedChat(r);
      const res = await fetch('/api/spy/get-history', { method:'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` }, body: JSON.stringify({phone:r.fromPhone, chatId:r.chatId, limit:20})});
      const d = await res.json();
      setChatHistory(d.history ? d.history.reverse() : []);
  };

  // ==========================================================================
  // RENDERIZAÇÃO
  // ==========================================================================

  if (!isAuthenticated) return (
      <div style={styles.loginContainer}>
          <div style={styles.loginBox}>
              <h2 style={{color:'white', textAlign:'center'}}>HOTTRACK V22</h2>
              <input type="password" placeholder="Token de Acesso" onChange={e => setCredentials({...credentials, token: e.target.value})} style={styles.input} />
              <button onClick={() => { if(credentials.token) { setAuthToken(credentials.token); setIsAuthenticated(true); localStorage.setItem('authToken', credentials.token); }}} style={styles.btn}>ACESSAR SISTEMA</button>
          </div>
      </div>
  );

  return (
    <div style={styles.mainContainer}>
        {/* HEADER */}
        <div style={styles.header}>
            <div style={{display:'flex', alignItems:'center', gap:10}}>
                <h2 style={{margin:0, color:'white'}}>HOTTRACK</h2>
                <span style={styles.badge}>V22 ULTIMATE</span>
            </div>
            <div style={{display:'flex', gap:10}}>
                <button onClick={() => setActiveTab('dashboard')} style={navBtn(activeTab==='dashboard')}>DASHBOARD</button>
                <button onClick={() => setActiveTab('factory')} style={navBtn(activeTab==='factory')}>🏭 FÁBRICA (AUTO)</button>
                <button onClick={() => {setActiveTab('inbox'); loadInbox();}} style={navBtn(activeTab==='inbox')}>INBOX</button>
            </div>
            <button onClick={() => setIsAuthenticated(false)} style={styles.logoutBtn}>SAIR</button>
        </div>

        {/* --- ABA FÁBRICA (FACTORY) --- */}
        {activeTab === 'factory' && (
            <div style={{display:'grid', gridTemplateColumns:'300px 1fr', gap:20, padding:20, flex:1, overflowY:'hidden'}}>
                
                {/* MENU LATERAL DA FÁBRICA */}
                <div style={{background:'#161b22', padding:20, borderRadius:10, border:'1px solid #30363d', display:'flex', flexDirection:'column', gap:10}}>
                    <button onClick={() => setFactoryTab('groups')} style={subTabBtn(factoryTab==='groups')}>📢 FÁBRICA DE GRUPOS</button>
                    <button onClick={() => setFactoryTab('bots')} style={subTabBtn(factoryTab==='bots')}>🤖 FÁBRICA DE BOTS</button>
                    
                    <div style={{marginTop:20, borderTop:'1px solid #30363d', paddingTop:20}}>
                        <h4 style={{marginTop:0}}>Contas Operadoras</h4>
                        <div style={{maxHeight:300, overflowY:'auto'}}>
                            {sessions.map(s => (
                                <div key={s.phone_number} onClick={() => {
                                    const n = new Set(selectedPhones);
                                    n.has(s.phone_number) ? n.delete(s.phone_number) : n.add(s.phone_number);
                                    setSelectedPhones(n);
                                }} style={{padding:8, fontSize:13, cursor:'pointer', color: selectedPhones.has(s.phone_number) ? '#58a6ff' : '#8b949e', display:'flex', alignItems:'center', gap:5}}>
                                    <div style={{width:8, height:8, borderRadius:'50%', background: s.is_active ? '#238636' : '#f85149'}}/>
                                    {s.phone_number}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* ÁREA DE CONFIGURAÇÃO E RESULTADOS */}
                <div style={{display:'flex', flexDirection:'column', gap:20, overflowY:'auto'}}>
                    
                    {factoryTab === 'groups' && (
                        <div style={styles.card}>
                            <h3 style={styles.cardHeader}>Configuração da Fábrica de Grupos</h3>
                            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:15}}>
                                <div>
                                    <label style={styles.label}>Nome Base dos Grupos</label>
                                    <input value={groupConfig.baseName} onChange={e=>setGroupConfig({...groupConfig, baseName:e.target.value})} style={styles.input} />
                                </div>
                                <div>
                                    <label style={styles.label}>Quantidade a Criar</label>
                                    <input type="number" value={groupConfig.amountToCreate} onChange={e=>setGroupConfig({...groupConfig, amountToCreate:e.target.value})} style={styles.input} />
                                </div>
                            </div>

                            <label style={styles.label}>Disparo Inicial (Assim que o grupo for criado)</label>
                            <div style={{display:'flex', gap:10}}>
                                <select value={groupConfig.mediaType} onChange={e=>setGroupConfig({...groupConfig, mediaType:e.target.value})} style={{...styles.select, width:100}}>
                                    <option value="text">Texto</option>
                                    <option value="image">Imagem</option>
                                    <option value="video">Vídeo</option>
                                </select>
                                <input placeholder="URL da Mídia (Opcional)" value={groupConfig.mediaUrl} onChange={e=>setGroupConfig({...groupConfig, mediaUrl:e.target.value})} style={{...styles.input, marginBottom:0}} />
                            </div>
                            <textarea placeholder="Texto da Oferta..." value={groupConfig.initialMessage} onChange={e=>setGroupConfig({...groupConfig, initialMessage:e.target.value})} style={{...styles.input, height:80, marginTop:10}} />

                            {!isProcessing ? (
                                <button onClick={runGroupFactory} style={styles.btn}>🚀 INICIAR PRODUÇÃO DE GRUPOS</button>
                            ) : (
                                <button onClick={() => stopProcessRef.current = true} style={{...styles.btn, background:'#f85149'}}>🛑 PARAR PRODUÇÃO</button>
                            )}

                            {/* TABELA DE RESULTADOS */}
                            <div style={{marginTop:30}}>
                                <h4>Grupos Criados Nesta Sessão</h4>
                                <div style={{background:'#010409', borderRadius:8, overflow:'hidden'}}>
                                    <div style={{display:'grid', gridTemplateColumns:'2fr 3fr 1fr 1fr', padding:10, background:'#21262d', fontSize:12, fontWeight:'bold'}}>
                                        <div>NOME</div>
                                        <div>LINK</div>
                                        <div>MEMBROS</div>
                                        <div>STATUS</div>
                                    </div>
                                    {createdGroups.map((g, i) => (
                                        <div key={i} style={{display:'grid', gridTemplateColumns:'2fr 3fr 1fr 1fr', padding:10, borderBottom:'1px solid #30363d', fontSize:13}}>
                                            <div>{g.name}</div>
                                            <div><a href={g.link} target="_blank" style={{color:'#58a6ff'}}>{g.link}</a></div>
                                            <div>{g.members}</div>
                                            <div style={{color:'#238636'}}>{g.status}</div>
                                        </div>
                                    ))}
                                    {createdGroups.length === 0 && <div style={{padding:20, textAlign:'center', color:'#8b949e', fontSize:13}}>Nenhum grupo criado ainda.</div>}
                                </div>
                            </div>
                        </div>
                    )}

                    {factoryTab === 'bots' && (
                        <div style={styles.card}>
                            <h3 style={styles.cardHeader}>Fábrica de Bots (@BotFather)</h3>
                            <div style={{display:'flex', gap:10}}>
                                <div style={{flex:1}}>
                                    <label style={styles.label}>Nome do Bot</label>
                                    <input placeholder="Ex: Atendimento VIP" value={botConfig.baseName} onChange={e=>setBotConfig({...botConfig, baseName:e.target.value})} style={styles.input} />
                                </div>
                                <div style={{width:100}}>
                                    <label style={styles.label}>Quantidade</label>
                                    <input type="number" value={botConfig.amount} onChange={e=>setBotConfig({...botConfig, amount:e.target.value})} style={styles.input} />
                                </div>
                            </div>
                            <label style={styles.label}>Foto de Perfil Padrão (URL)</label>
                            <input placeholder="https://..." value={botConfig.setPhoto} onChange={e=>setBotConfig({...botConfig, setPhoto:e.target.value})} style={styles.input} />
                            
                            <button onClick={runBotFactory} style={{...styles.btn, background:'#8957e5'}}>🤖 GERAR BOTS</button>

                            <div style={{marginTop:20}}>
                                <h4>Tokens Gerados</h4>
                                <textarea readOnly value={createdBots.map(b => `${b.token} | @${b.username}`).join('\n')} style={{width:'100%', height:200, background:'#010409', border:'1px solid #30363d', color:'#58a6ff', padding:10, fontFamily:'monospace'}} />
                            </div>
                        </div>
                    )}

                    {/* LOGS GERAIS */}
                    <div style={{background:'#010409', padding:15, borderRadius:10, border:'1px solid #30363d', height:150, overflowY:'auto', fontFamily:'monospace', fontSize:12}}>
                        {logs.map((l, i) => <div key={i} style={{color: l.includes('Erro')?'#f85149':'#8b949e'}}>{l}</div>)}
                    </div>
                </div>
            </div>
        )}

        {/* --- ABA DASHBOARD (SIMPLIFICADA) --- */}
        {activeTab === 'dashboard' && (
            <div style={{padding:25, display:'grid', gridTemplateColumns:'1fr 1fr', gap:25}}>
                <StatBox label="LEADS TOTAIS" val={stats.total} color="#8957e5" />
                <StatBox label="GRUPOS CRIADOS" val={createdGroups.length} color="#238636" />
                <StatBox label="BOTS CRIADOS" val={createdBots.length} color="#d29922" />
            </div>
        )}

        {/* --- ABA INBOX --- */}
        {activeTab === 'inbox' && (
             <div style={styles.chatContainer}>
                 <div style={styles.chatSidebar}>
                     <div style={{flex:1, overflowY:'auto'}}>
                         {replies.map(r => (
                             <div key={r.chatId} onClick={()=>openChat(r)} style={{padding:15, borderBottom:'1px solid #21262d', background: selectedChat?.chatId===r.chatId?'#1f6feb22':'transparent'}}>
                                 <b>{r.name}</b><br/>{r.lastMessage}
                             </div>
                         ))}
                     </div>
                 </div>
                 <div style={styles.chatArea}>
                     {selectedChat ? (
                         <div style={{padding:20}}>
                             <h3>{selectedChat.name}</h3>
                             {/* Histórico renderizado aqui */}
                         </div>
                     ) : <div style={{padding:50, textAlign:'center'}}>Selecione</div>}
                 </div>
             </div>
        )}
    </div>
  );
}

// ============================================================================
// ESTILOS
// ============================================================================
const styles = {
    mainContainer: { background: '#0d1117', height: '100vh', display: 'flex', flexDirection: 'column', color: '#c9d1d9', fontFamily: 'sans-serif' },
    header: { padding: '15px 25px', background: '#161b22', borderBottom: '1px solid #30363d', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    badge: { fontSize: 10, background: '#238636', padding: '3px 7px', borderRadius: 4, color: 'white', fontWeight: 'bold' },
    loginContainer: { height: '100vh', background: '#0d1117', display: 'flex', justifyContent: 'center', alignItems: 'center' },
    loginBox: { background: '#161b22', padding: 40, borderRadius: 12, border: '1px solid #30363d', width: 350 },
    card: { background: '#161b22', padding: 25, borderRadius: 10, border: '1px solid #30363d' },
    cardHeader: { marginTop: 0, paddingBottom: 15, borderBottom: '1px solid #30363d' },
    input: { width: '100%', padding: 12, background: '#010409', border: '1px solid #30363d', color: 'white', borderRadius: 8, marginBottom: 15, boxSizing: 'border-box' },
    select: { background: '#010409', color: 'white', border: '1px solid #30363d', padding: 12, borderRadius: 8 },
    btn: { width: '100%', padding: 14, background: '#238636', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold' },
    logoutBtn: { background: '#f85149', border: 'none', color: 'white', padding: '8px 15px', borderRadius: 6, cursor: 'pointer', fontWeight: 'bold' },
    label: { display: 'block', fontSize: 12, color: '#8b949e', marginBottom: 5, fontWeight: 'bold' },
    chatContainer: { flex: 1, display: 'grid', gridTemplateColumns: '300px 1fr' },
    chatSidebar: { borderRight: '1px solid #30363d', background: '#111b21' },
    chatArea: { background: '#0b141a' }
};

const navBtn = (active) => ({
    background: active ? '#1f6feb' : 'transparent', border: '1px solid #30363d', color: 'white', padding: '8px 15px', borderRadius: 6, cursor: 'pointer', fontWeight: 'bold'
});

const subTabBtn = (active) => ({
    width: '100%', padding: 12, background: active ? '#1f6feb22' : 'transparent', color: active ? '#58a6ff' : '#8b949e', border: active ? '1px solid #1f6feb' : '1px solid transparent', borderRadius: 6, cursor: 'pointer', textAlign: 'left', fontWeight: 'bold'
});

const StatBox = ({ label, val, color }) => (
    <div style={{ background: '#161b22', padding: 20, borderRadius: 10, borderLeft: `5px solid ${color}` }}>
        <h2 style={{ margin: 0, fontSize: 28, color: 'white' }}>{val}</h2>
        <small style={{ color: '#8b949e', fontWeight: 'bold' }}>{label}</small>
    </div>
);
