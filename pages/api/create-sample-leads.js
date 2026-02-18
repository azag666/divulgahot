import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  try {
    console.log('🔄 Criando leads de exemplo com @username...');
    
    // Criar leads de exemplo com @username
    const sampleLeads = [];
    const usernames = [
      '@user123', '@user456', '@user789', '@user101', '@user202',
      '@user303', '@user404', '@user505', '@user606', '@user707',
      '@user808', '@user909', '@user111', '@user222', '@user333',
      '@user444', '@user555', '@user666', '@user777', '@user888',
      '@user999', '@user000', '@test123', '@test456', '@test789',
      '@demo123', '@demo456', '@demo789', '@sample123', '@sample456',
      '@sample789', '@example123', '@example456', '@example789',
      '@alpha123', '@beta456', '@gamma789', '@delta123', '@epsilon456',
      '@zeta789', '@eta123', '@theta456', '@iota789', '@kappa123'
    ];
    
    usernames.forEach((username, index) => {
      sampleLeads.push({
        phone: username,
        first_name: `User${index + 1}`,
        last_name: 'Test',
        assigned_to_channel: null
      });
    });
    
    console.log(`📝 Inserindo ${sampleLeads.length} leads com @username...`);
    
    // Inserir leads no banco
    const { data: insertedLeads, error: insertError } = await supabase
      .from('leads')
      .upsert(sampleLeads, { onConflict: 'phone' });
    
    if (insertError) {
      console.error('❌ Erro ao inserir leads:', insertError);
      return res.status(500).json({ 
        success: false,
        error: 'Erro ao inserir leads',
        details: insertError.message
      });
    }
    
    console.log(`✅ ${sampleLeads.length} leads inseridos com sucesso!`);
    
    // Verificar total de leads com @username
    const { data: allLeads } = await supabase
      .from('leads')
      .select('id, phone, first_name, last_name')
      .limit(10000);
    
    const leadsWithUsername = allLeads.filter(lead => 
      lead.phone && lead.phone.includes('@')
    );
    
    res.json({ 
      success: true,
      message: `Criados ${sampleLeads.length} leads de exemplo com @username`,
      totalInserted: sampleLeads.length,
      totalLeadsWithUsername: leadsWithUsername.length,
      leads: insertedLeads
    });

  } catch (e) {
    console.error('❌ Erro ao criar leads:', e);
    res.status(500).json({ 
      success: false,
      error: e.message
    });
  }
}
