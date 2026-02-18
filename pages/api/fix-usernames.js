import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  try {
    console.log('🔧 Corrigindo usernames na tabela leads_hottrack...');
    
    // Buscar todos leads
    const { data: allLeads, error: leadsError } = await supabase
      .from('leads_hottrack')
      .select('user_id, username')
      .limit(10000);
    
    if (leadsError) {
      return res.status(500).json({ 
        success: false,
        error: 'Erro ao buscar leads',
        details: leadsError.message
      });
    }
    
    console.log(`📊 Encontrados ${allLeads.length} leads para processar`);
    
    // Corrigir usernames sem @
    const leadsToFix = allLeads.filter(lead => 
      lead.username && 
      typeof lead.username === 'string' && 
      !lead.username.startsWith('@')
    );
    
    console.log(`🔧 ${leadsToFix.length} leads precisam de correção`);
    
    let fixedCount = 0;
    const batchSize = 100;
    
    for (let i = 0; i < leadsToFix.length; i += batchSize) {
      const batch = leadsToFix.slice(i, i + batchSize);
      
      for (const lead of batch) {
        try {
          const { error: updateError } = await supabase
            .from('leads_hottrack')
            .update({ username: `@${lead.username}` })
            .eq('user_id', lead.user_id);
          
          if (updateError) {
            console.error(`❌ Erro ao corrigir lead ${lead.user_id}:`, updateError);
          } else {
            fixedCount++;
            if (fixedCount % 100 === 0) {
              console.log(`✅ Corrigidos ${fixedCount} usernames...`);
            }
          }
        } catch (e) {
          console.error(`❌ Erro ao processar lead ${lead.user_id}:`, e);
        }
      }
    }
    
    // Verificar resultado
    const { count: totalWithUsername } = await supabase
      .from('leads_hottrack')
      .select('*', { count: 'exact', head: true })
      .like('username', '@%');
    
    console.log(`🎉 Correção concluída!`);
    console.log(`📊 Resultado:`);
    console.log(`  - Leads corrigidos: ${fixedCount}`);
    console.log(`  - Total com @username: ${totalWithUsername}`);
    
    res.json({ 
      success: true,
      message: `Correção concluída com sucesso!`,
      results: {
        totalLeads: allLeads.length,
        leadsToFix: leadsToFix.length,
        fixedCount: fixedCount,
        totalWithUsername: totalWithUsername || 0
      }
    });
    
  } catch (e) {
    console.error('❌ Erro geral:', e);
    res.status(500).json({ 
      success: false,
      error: e.message
    });
  }
}
