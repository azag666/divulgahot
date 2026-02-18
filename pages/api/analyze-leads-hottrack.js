import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).send('Method Not Allowed');

  try {
    console.log('🔍 Verificando estrutura da tabela leads_hottrack...');
    
    // Verificar estrutura da tabela
    const { data: tableInfo, error: tableError } = await supabase
      .from('leads_hottrack')
      .select('*')
      .limit(5);
    
    if (tableError) {
      console.error('❌ Erro ao buscar dados:', tableError);
      return res.status(500).json({ 
        success: false,
        error: 'Erro ao buscar dados da tabela leads_hottrack',
        details: tableError.message
      });
    }
    
    console.log('📊 Estrutura encontrada:');
    if (tableInfo.length > 0) {
      console.log('Colunas encontradas:', Object.keys(tableInfo[0]));
      tableInfo.forEach((lead, index) => {
        console.log(`  ${index + 1}:`, lead);
      });
    }
    
    // Contar total de leads
    const { count: totalCount, error: countError } = await supabase
      .from('leads_hottrack')
      .select('*', { count: 'exact', head: true });
    
    let totalLeads = totalCount || 0;
    if (countError) {
      console.error('❌ Erro ao contar total:', countError);
    }
    
    // Verificar diferentes tipos de chat_id
    const { data: sampleLeads } = await supabase
      .from('leads_hottrack')
      .select('user_id, username, chat_id')
      .limit(20);
    
    // Analisar chat_ids
    const chatIdTypes = {};
    const validChatIds = [];
    const invalidChatIds = [];
    
    sampleLeads.forEach(lead => {
      const type = typeof lead.chat_id;
      chatIdTypes[type] = (chatIdTypes[type] || 0) + 1;
      
      if (lead.chat_id) {
        if (type === 'number' && lead.chat_id > 0) {
          validChatIds.push(lead);
        } else if (type === 'string' && lead.chat_id.includes('@')) {
          validChatIds.push(lead);
        } else {
          invalidChatIds.push(lead);
        }
      }
    });
    
    console.log('📈 Análise de chat_id:');
    console.log('  Tipos encontrados:', chatIdTypes);
    console.log(`  Válidos: ${validChatIds.length}`);
    console.log(`  Inválidos: ${invalidChatIds.length}`);
    
    // Contar leads com username válido
    const { count: usernameCount } = await supabase
      .from('leads_hottrack')
      .select('*', { count: 'exact', head: true })
      .like('username', '@%');
    
    // Contar leads com chat_id válido
    const { count: validChatIdCount } = await supabase
      .from('leads_hottrack')
      .select('*', { count: 'exact', head: true })
      .or('chat_id.gt.0,chat_id.like.@%');
    
    res.json({ 
      success: true,
      tableStructure: tableInfo.length > 0 ? Object.keys(tableInfo[0]) : [],
      totalLeads: totalLeads,
      withUsername: usernameCount || 0,
      withValidChatId: validChatIdCount || 0,
      chatIdTypes: chatIdTypes,
      sampleLeads: sampleLeads,
      validChatIds: validChatIds.slice(0, 10),
      invalidChatIds: invalidChatIds.slice(0, 10),
      message: `Análise completa: ${totalLeads} totais, ${usernameCount || 0} com @username, ${validChatIdCount || 0} com chat_id válido`
    });

  } catch (e) {
    console.error('❌ Erro ao analisar leads:', e);
    res.status(500).json({ 
      success: false,
      error: e.message
    });
  }
}
