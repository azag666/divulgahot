// CORREÇÃO MANUAL PARA LINHA 3560 DO admin.js

// PROBLEMA:
// <div style={{width:'8px', height:'8px', borderRadius:'50%', background: channel.status === 'broadcast_sent' ? '#238636' : channel.status === 'members_added' ? '#f59e0b' : '#6e7681'}}></div>

// SOLUÇÃO:
// Substituir a linha 3560 por:
<div style={{width:'8px', height:'8px', borderRadius:'50%', background: channel.status === 'broadcast_sent' ? '#238636' : channel.status === 'members_added' ? '#f59e0b' : '#6e7681'}}></div>

// OU usar template string:
<div style={{width:'8px', height:'8px', borderRadius:'50%', background: (() => {
  if (channel.status === 'broadcast_sent') return '#238636';
  if (channel.status === 'members_added') return '#f59e0b';
  return '#6e7681';
})()}}></div>

// INSTRUÇÕES:
// 1. Abra /Users/cex/divulgahot/pages/admin.js
// 2. Vá para linha 3560
// 3. Substitua a linha inteira pela solução acima
// 4. Salve o arquivo
// 5. Execute: git add . && git commit -m "fix: JSX syntax error" && git push origin main
