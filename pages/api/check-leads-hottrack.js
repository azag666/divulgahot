import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).send('Method Not Allowed');

  try {
    console.log('🔍 Verificando tabela leads_hottrack...');
    
    // Verificar se tabela leads_hottrack existe e buscar dados
    const { data: leads, error: leadsError } = await supabase
      .from('leads_hottrack')
      .select('user_id, username')
      .limit(100); // Limitar para teste
    
    if (leadsError) {
      console.error('❌ Erro ao buscar leads:', leadsError);
      return res.status(500).json({ 
        success: false,
        error: 'Erro ao buscar leads da tabela leads_hottrack',
        details: leadsError.message
      });
    }
    
    console.log(`📊 Total de leads encontrados (primeiros 100): ${leads.length}`);
    
    // Filtrar leads com @username
    const leadsWithUsername = leads.filter(lead => 
      lead.username && lead.username.includes('@')
    );
    
    console.log(`🔍 Leads com @username (primeiros 100): ${leadsWithUsername.length}`);
    
    // Contar total de leads (sem limite)
    const { count: totalCount, error: countError } = await supabase
      .from('leads_hottrack')
      .select('*', { count: 'exact', head: true });
    
    let totalLeads = totalCount || 0;
    if (countError) {
      console.error('❌ Erro ao contar total:', countError);
    }
    
    // Contar leads com @username (amostra)
    const { count: usernameCount, error: usernameCountError } = await supabase
      .from('leads_hottrack')
      .select('*', { count: 'exact', head: true })
      .like('username', '@%');
    
    let totalWithUsername = usernameCount || 0;
    if (usernameCountError) {
      console.error('❌ Erro ao contar com @:', usernameCountError);
    }
    
    // Mostrar exemplos
    console.log('📝 Exemplos de leads:');
    leads.slice(0, 10).forEach(lead => {
      console.log(`  - ID: ${lead.user_id}, Username: ${lead.username}`);
    });
    
    res.json({ 
      success: true,
      totalLeads: totalLeads,
      leadsWithUsername: totalWithUsername,
      sampleLeads: leads.slice(0, 20),
      message: totalWithUsername === 0 
        ? 'Nenhum lead com @username encontrado na tabela leads_hottrack'
        : `Encontrados ${totalWithUsername} leads com @username de ${totalLeads} totais na tabela leads_hottrack`
    });

  } catch (e) {
    console.error('❌ Erro ao verificar leads:', e);
    res.status(500).json({ 
      success: false,
      error: e.message
    });
  }
}
