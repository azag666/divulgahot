export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const limit = parseInt(req.query.limit) || 100;

    // Simulação de busca de leads não agrupados
    // Em produção, aqui buscaria no banco de dados leads que ainda não foram atribuídos a grupos
    
    console.log(`Fetching ${limit} unassigned leads`);

    // Simula leads fictícios para teste
    const mockLeads = Array.from({ length: Math.min(limit, 50) }, (_, i) => ({
      id: `lead_${Date.now()}_${i}`,
      user_id: `user_${Math.random().toString(36).substr(2, 9)}`,
      username: `user_${i + 1}`,
      chat_id: `chat_${Math.random().toString(36).substr(2, 9)}`,
      phone: `+55${Math.floor(Math.random() * 900000000) + 100000000}`,
      status: 'pending'
    }));

    res.status(200).json({
      success: true,
      leads: mockLeads,
      total: mockLeads.length,
      message: `Found ${mockLeads.length} unassigned leads`
    });

  } catch (error) {
    console.error('Error fetching unassigned leads:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error while fetching leads' 
    });
  }
}
