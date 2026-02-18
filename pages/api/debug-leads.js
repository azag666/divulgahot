import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).send('Method Not Allowed');

  try {
    console.log('🔍 DEBUG: Verificando leads_hottrack...');
    
    // Buscar todos leads para análise
    const { data: allLeads, error: leadsError } = await supabase
      .from('leads_hottrack')
      .select('user_id, username, chat_id')
      .limit(1000);
    
    if (leadsError) {
      console.error('❌ Erro ao buscar leads:', leadsError);
      return res.status(500).json({ 
        success: false,
        error: 'Erro ao buscar leads',
        details: leadsError.message
      });
    }
    
    console.log(`📊 Total de leads encontrados (primeiros 1000): ${allLeads.length}`);
    
    // Filtrar leads com @username
    const leadsWithUsername = allLeads.filter(lead => 
      lead.username && lead.username.includes('@')
    );
    
    console.log(`🔍 Leads com @username: ${leadsWithUsername.length}`);
    
    // Mostrar exemplos
    console.log('📝 Exemplos de leads:');
    allLeads.slice(0, 10).forEach((lead, index) => {
      console.log(`  ${index + 1}: ID=${lead.user_id}, Username=${lead.username}, Chat_ID=${lead.chat_id}`);
    });
    
    // Contar total exato
    const { count: totalCount, error: countError } = await supabase
      .from('leads_hottrack')
      .select('*', { count: 'exact', head: true });
    
    // Contar com @username
    const { count: usernameCount, error: usernameCountError } = await supabase
      .from('leads_hottrack')
      .select('*', { count: 'exact', head: true })
      .like('username', '@%');
    
    res.json({ 
      success: true,
      totalLeads: totalCount || 0,
      leadsWithUsername: usernameCount || 0,
      sampleLeads: allLeads.slice(0, 20),
      debug: {
        sampleSize: allLeads.length,
        withUsernameInSample: leadsWithUsername.length,
        examples: allLeads.slice(0, 5).map(lead => ({
          user_id: lead.user_id,
          username: lead.username,
          chat_id: lead.chat_id,
          hasUsername: lead.username && lead.username.includes('@')
        }))
      },
      message: `Análise: ${totalCount || 0} totais, ${usernameCount || 0} com @username`
    });

  } catch (e) {
    console.error('❌ Erro geral:', e);
    res.status(500).json({ 
      success: false,
      error: e.message
    });
  }
}
