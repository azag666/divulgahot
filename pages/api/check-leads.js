import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).send('Method Not Allowed');

  try {
    console.log('🔍 Verificando tabela leads...');
    
    // Verificar se tabela leads existe
    const { data: leads, error: leadsError } = await supabase
      .from('leads')
      .select('id, phone, first_name, last_name, assigned_to_channel')
      .limit(100);
    
    if (leadsError) {
      console.error('❌ Erro ao buscar leads:', leadsError);
      return res.status(500).json({ 
        success: false,
        error: 'Erro ao buscar leads',
        details: leadsError.message
      });
    }
    
    console.log(`📊 Total de leads encontrados: ${leads.length}`);
    
    // Filtrar leads com @username
    const leadsWithUsername = leads.filter(lead => 
      lead.phone && lead.phone.includes('@')
    );
    
    console.log(`🔍 Leads com @username: ${leadsWithUsername.length}`);
    
    // Mostrar exemplos
    console.log('📝 Exemplos de leads:');
    leads.slice(0, 10).forEach(lead => {
      console.log(`  - ${lead.phone} (${lead.first_name} ${lead.last_name || ''})`);
    });
    
    res.json({ 
      success: true,
      totalLeads: leads.length,
      leadsWithUsername: leadsWithUsername.length,
      examples: leads.slice(0, 10),
      message: leadsWithUsername.length === 0 
        ? 'Nenhum lead com @username encontrado. Verifique se os leads foram importados corretamente.'
        : `Encontrados ${leadsWithUsername.length} leads com @username de ${leads.length} totais`
    });

  } catch (e) {
    console.error('❌ Erro ao verificar leads:', e);
    res.status(500).json({ 
      success: false,
      error: e.message
    });
  }
}
