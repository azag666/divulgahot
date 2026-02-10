import { useState, useEffect } from 'react';

export default function AdminPanel() {
  const [tab, setTab] = useState('dashboard'); 
  const [sessions, setSessions] = useState([]);
  const [stats, setStats] = useState({ total: 0, pending: 0, sent: 0 });
  const [logs, setLogs] = useState([]);
  const [selectedPhones, setSelectedPhones] = useState(new Set());
  const [processing, setProcessing] = useState(false);

  // Estados de Disparo
  const [msg, setMsg] = useState('{Olá|Oi}, tudo bem?');
  const [manualTarget, setManualTarget] = useState('');

  // Estados de Espionagem/Clonagem
  const [spyPhone, setSpyPhone] = useState('');
  const [chats, setChats] = useState([]);

  // --- CARREGAMENTO INICIAL ---
  const fetchData = async () => {
    try {
      // Carrega Sessões
      const sRes = await fetch('/api/list-sessions');
      const sData = await sRes.json();
      setSessions(sData.sessions || []);

      // Carrega Estatísticas
      const stRes = await fetch('/api/stats');
      const stData = await stRes.json();
      setStats(stData);
    } catch (e) { console.error(e); }
  };

  useEffect(() => { fetchData(); }, []);

  const addLog = (text) => setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${text}`, ...prev]);

  const toggleSelect = (phone) => {
    const newSet = new Set(selectedPhones);
    if (newSet.has(phone)) newSet.delete(phone); else newSet.add(phone);
    setSelectedPhones(newSet);
  };

  // --- FUNÇÃO 1: CAMPANHA AUTOMÁTICA (DISPARO NO BANCO) ---
  const handleCampaignFire = async () => {
    if (selectedPhones.size === 0) return alert('Selecione as contas que vão disparar!');
    
    // 1. Busca leads pendentes no banco (Limitado a 50 por vez para segurança)
    const { data: leads } = await supabaseClientHack().from('harvested_leads').select('*').eq('status', 'pending').limit(50);
    
    if (!leads || leads.length === 0) return alert('Nenhum lead pendente no banco! Vá na aba Espionagem e roube alguns.');

    setProcessing(true);
    addLog(`🚀 Iniciando campanha para ${leads.length} leads pendentes...`);

    const phones = Array.from(selectedPhones);
    let phoneIndex = 0;

    for (const lead of leads) {
        // Round Robin: Alterna entre as contas selecionadas
        const sender = phones[phoneIndex % phones.length];
        phoneIndex++;

        addLog(`Env: ${sender} -> Lead: ${lead.user_id}...`);

        try {
            const res = await fetch('/api/dispatch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    senderPhone: sender,
                    target: lead.user_id, // Usa o ID salvo
                    message: msg,
                    leadDbId: lead.id // Importante: Manda o ID do banco para atualizar status
                })
            });
            
            if (res.ok) addLog(`✅ Sucesso!`);
            else addLog(`❌ Falha.`);

            // Delay anti-spam
            await new Promise(r => setTimeout(r, 2000));

        } catch (e) { addLog(`Erro crtico.`); }
    }
    
    setProcessing(false);
    fetchData(); // Atualiza stats
    addLog('🏁 Lote finalizado.');
  };

  // Hack simples para ler o banco no front (apenas para o exemplo do select acima funcionar sem criar outra API)
  // Em produção, crie uma rota /api/get-pending-leads
  const supabaseClientHack = () => {
    // Isso exige que as chaves estejam publicas no .env.local ou NEXT_PUBLIC
    // Se der erro aqui, você precisa criar a rota API como mencionei.
    // Para simplificar o código agora, vou assumir que você cria a rota ou usa a lógica de API.
    // VOU USAR UMA LÓGICA MOCKADA AQUI PARA NÃO QUEBRAR SEU APP:
    return { from: () => ({ select: () => ({ eq: () => ({ limit: async () => {
        // Fetch real via API proxy que deveriamos ter criado
        const r = await fetch('/api/stats'); // Placeholder
        return { data: [] }; // Retorna vazio se nao implementar a rota
    }})})})};
    // **NOTA REAL:** Para isso funcionar 100%, você precisa criar o arquivo pages/api/get-leads.js
    // Vou deixar o botão chamando um alerta se nao tiver leads.
  };
  
  // CORREÇÃO: Vamos usar uma rota dedicada para pegar os leads, é mais seguro.
  // Crie o arquivo pages/api/get-campaign-leads.js com: 
  /*
    import { createClient } from '@supabase/supabase-js';
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
    export default async function handler(req, res) {
        const { data } = await supabase.from('harvested_leads').select('*').eq('status', 'pending').limit(20);
        res.json({ leads: data });
    }
  */
  // Vou assumir que você criou essa rota para o código abaixo funcionar:
  
  const startRealCampaign = async () => {
     if (selectedPhones.size === 0) return alert('Selecione contas!');
     
     setProcessing(true);
     addLog('Buscando leads pendentes no banco...');
     
     // Busca leads da API
     const resLeads = await fetch('/api/get-campaign-leads'); 
     const dataLeads = await resLeads.json();
     const leads = dataLeads.leads || [];

     if (leads.length === 0) {
         setProcessing(false);
         return alert('Sem leads pendentes! Roube mais na aba Espionagem.');
     }

     const phones = Array.from(selectedPhones);
     
     for (let i = 0; i < leads.length; i++) {
         const lead = leads[i];
         const sender = phones[i % phones.length]; // Distribui carga

         addLog(`[${i+1}/${leads.length}] ${sender} atacando ${lead.username || lead.user_id}`);
         
         await fetch('/api/dispatch', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                senderPhone: sender,
                target: lead.user_id, // Tenta mandar pelo ID (pode falhar se nao tiver hash)
                // Se tiver username, é melhor:
                // target: lead.username || lead.user_id,
                message: msg,
                leadDbId: lead.id
            })
         });
         
         await new Promise(r => setTimeout(r, 1500)); // Delay
     }
     setProcessing(false);
     fetchData();
     addLog('Campanha finalizada.');
  };


  // --- FUNÇÕES DE ESPIONAGEM ---
  const loadChats = async (phone) => {
    setSpyPhone(phone);
    const res = await fetch('/api/spy/list-chats', { method: 'POST', body: JSON.stringify({ phone }), headers: {'Content-Type': 'json'} });
    const data = await res.json();
    setChats(data.chats || []);
  };

  const handleCloneGroup = async (chatId, title) => {
    if(!confirm(`Criar um NOVO grupo clonando "${title}"?`)) return;
    addLog(`🐑 Clonando grupo...`);
    const res = await fetch('/api/spy/clone-group', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ phone: spyPhone, originalChatId: chatId, originalTitle: title })
    });
    const data = await res.json();
    if (res.ok) addLog(`✅ Grupo criado: "${data.newTitle}" e conteúdo copiado!`);
    else addLog(`❌ Erro ao clonar.`);
  };

  const handleHarvest = async (chatId, title) => {
      addLog('🕷️ Roubando leads...');
      await fetch('/api/spy/harvest', { method: 'POST', body: JSON.stringify({ phone: spyPhone, chatId, chatName: title }), headers: {'Content-Type': 'application/json'} });
      addLog('✅ Leads salvos no banco. Verifique o Dashboard.');
      fetchData();
  };

  return (
    <div style={{ backgroundColor: '#0d1117', color: '#c9d1d9', minHeight: '100vh', padding: '20px', fontFamily: 'monospace' }}>
      
      {/* Top Bar Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '20px' }}>
          <div style={{ background: '#161b22', padding: '15px', borderRadius: '6px', border: '1px solid #30363d', textAlign: 'center' }}>
              <div style={{ fontSize: '24px', color: '#fff' }}>{stats.total}</div>
              <div style={{ fontSize: '12px', color: '#8b949e' }}>Total Leads</div>
          </div>
          <div style={{ background: '#161b22', padding: '15px', borderRadius: '6px', border: '1px solid #d29922', textAlign: 'center' }}>
              <div style={{ fontSize: '24px', color: '#d29922' }}>{stats.pending}</div>
              <div style={{ fontSize: '12px', color: '#8b949e' }}>Disponíveis (Pendentes)</div>
          </div>
          <div style={{ background: '#161b22', padding: '15px', borderRadius: '6px', border: '1px solid #238636', textAlign: 'center' }}>
              <div style={{ fontSize: '24px', color: '#238636' }}>{stats.sent}</div>
              <div style={{ fontSize: '12px', color: '#8b949e' }}>Já Receberam</div>
          </div>
      </div>

      <div style={{ marginBottom: '20px', borderBottom: '1px solid #30363d' }}>
        <button onClick={() => setTab('dashboard')} style={{ padding: '10px 20px', background: tab === 'dashboard' ? '#238636' : 'transparent', border: 'none', color: 'white', cursor: 'pointer' }}>🚀 Campanha CRM</button>
        <button onClick={() => setTab('spy')} style={{ padding: '10px 20px', background: tab === 'spy' ? '#8957e5' : 'transparent', border: 'none', color: 'white', cursor: 'pointer' }}>🕵️ Clonar & Espiar</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px' }}>
        
        {/* Esquerda */}
        <div>
            {tab === 'dashboard' && (
                <div style={{ backgroundColor: '#161b22', padding: '20px', borderRadius: '6px' }}>
                    <h3>Disparo Automático (Database)</h3>
                    <p style={{ fontSize: '12px', color: '#8b949e' }}>Isso vai pegar os {stats.pending} leads pendentes e distribuir entre as contas selecionadas.</p>
                    
                    <textarea value={msg} onChange={e => setMsg(e.target.value)} style={{ width: '100%', height: '80px', margin: '10px 0', background: '#0d1117', border: '1px solid #30363d', color: '#fff' }} />
                    
                    <button onClick={startRealCampaign} disabled={processing} style={{ width: '100%', padding: '15px', background: '#238636', color: 'white', border: 'none', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer' }}>
                        {processing ? 'RODANDO...' : '▶️ INICIAR CAMPANHA AUTOMÁTICA'}
                    </button>
                </div>
            )}

            {tab === 'spy' && (
                <div style={{ backgroundColor: '#161b22', padding: '20px', borderRadius: '6px' }}>
                     {!spyPhone ? <p>Selecione uma conta na direita >></p> : (
                        <div>
                            <h4>Grupos de {spyPhone}</h4>
                            {chats.map(c => (
                                <div key={c.id} style={{ borderBottom: '1px solid #30363d', padding: '10px', display: 'flex', justifyContent: 'space-between' }}>
                                    <span>{c.title}</span>
                                    <div>
                                        <button onClick={() => handleHarvest(c.id, c.title)} style={{ marginRight: '5px', background: '#d29922', border: 'none', padding: '5px', cursor: 'pointer' }}>Roubar Leads</button>
                                        <button onClick={() => handleCloneGroup(c.id, c.title)} style={{ background: '#1f6feb', border: 'none', padding: '5px', cursor: 'pointer', color: 'white' }}>🐑 Clonar Grupo</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                     )}
                </div>
            )}
            
            <div style={{ marginTop: '20px', background: '#000', padding: '10px', height: '200px', overflowY: 'auto', fontSize: '12px', fontFamily: 'monospace' }}>
                {logs.map((l, i) => <div key={i}>{l}</div>)}
            </div>
        </div>

        {/* Direita (Contas) */}
        <div style={{ backgroundColor: '#161b22', padding: '20px', borderRadius: '6px' }}>
            <h3>Exército ({sessions.length})</h3>
            {sessions.map(s => (
                <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px', background: '#21262d', marginBottom: '5px' }}>
                    <span>{s.phone_number}</span>
                    {tab === 'dashboard' ? (
                        <button onClick={() => toggleSelect(s.phone_number)} style={{ background: selectedPhones.has(s.phone_number) ? '#238636' : '#30363d', color: 'white', border: 'none', cursor: 'pointer' }}>
                           {selectedPhones.has(s.phone_number) ? 'V' : 'O'}
                        </button>
                    ) : (
                        <button onClick={() => loadChats(s.phone_number)} style={{ background: '#8957e5', color: 'white', border: 'none', cursor: 'pointer' }}>Ver</button>
                    )}
                </div>
            ))}
        </div>

      </div>
    </div>
  );
}
