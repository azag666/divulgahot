import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions";
import { createClient } from '@supabase/supabase-js';
const { authenticate } = require('../../../lib/middleware');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const apiId = parseInt(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  // Aplica autenticação
  await authenticate(req, res, async () => {
    const { 
      targetBotUsername, 
      selectedPhones, 
      reportReason = 'spam',
      batchSize = 5,
      delayBetweenReports = 30000 // 30 segundos entre denúncias
    } = req.body;
    
    console.log(`🚨 DEBUG mass-report-bot: target=${targetBotUsername}, phones=${selectedPhones?.length}, reason=${reportReason}`);
    
    if (!targetBotUsername || !selectedPhones || selectedPhones.length === 0) {
      console.error('❌ Missing required fields');
      return res.status(400).json({ 
        success: false,
        error: 'Campos obrigatórios: targetBotUsername, selectedPhones' 
      });
    }
    
    // Normaliza o username do bot (remove @ se existir)
    const botUsername = targetBotUsername.startsWith('@') ? targetBotUsername.substring(1) : targetBotUsername;
    
    const results = [];
    let totalReports = 0;
    let totalFailed = 0;
    
    try {
      // Processa cada telefone para fazer denúncias
      for (let phoneIndex = 0; phoneIndex < selectedPhones.length; phoneIndex++) {
        const phone = selectedPhones[phoneIndex];
        console.log(`📱 Processando telefone ${phoneIndex + 1}/${selectedPhones.length}: ${phone}`);
        
        // Busca sessão do telefone
        const { data: sessionData, error: sessionError } = await supabase
          .from('telegram_sessions')
          .select('session_string, owner_id')
          .eq('phone_number', phone)
          .single();
        
        if (sessionError || !sessionData) {
          console.error(`❌ Sessão não encontrada para ${phone}:`, sessionError);
          results.push({
            phone: phone,
            success: false,
            error: 'Sessão não encontrada'
          });
          totalFailed++;
          continue;
        }
        
        // Se não for admin, valida que a sessão pertence ao usuário logado
        if (!req.isAdmin && req.userId && sessionData.owner_id !== req.userId) {
          results.push({
            phone: phone,
            success: false,
            error: 'Acesso negado'
          });
          totalFailed++;
          continue;
        }
        
        const client = new TelegramClient(new StringSession(sessionData.session_string), apiId, apiHash, { 
          connectionRetries: 1, 
          useWSS: false,
          timeout: 30000
        });
        
        try {
          console.log(`📡 Conectando com ${phone}...`);
          await client.connect();
          
          // 1. Busca o bot alvo
          console.log(`🔍 Buscando bot @${botUsername}...`);
          let botEntity;
          try {
            botEntity = await client.getInputEntity(botUsername);
            console.log(`✅ Bot encontrado:`, botEntity);
          } catch (botError) {
            console.error(`❌ Bot @${botUsername} não encontrado:`, botError.message);
            results.push({
              phone: phone,
              success: false,
              error: `Bot @${botUsername} não encontrado`
            });
            totalFailed++;
            await client.disconnect();
            continue;
          }
          
          // 2. Faz múltiplas denúncias deste número
          const reportsPerPhone = Math.min(batchSize, 5); // Limite de 5 denúncias por telefone para evitar ban
          
          for (let reportIndex = 0; reportIndex < reportsPerPhone; reportIndex++) {
            console.log(`🚨 Enviando denúncia ${reportIndex + 1}/${reportsPerPhone} de ${phone}...`);
            
            try {
              // Envia denúncia contra o bot
              await client.invoke(new Api.account.ReportPeer({
                peer: botEntity,
                reason: new Api.InputReportReasonSpam(),
                message: `Bot spamming and violating Telegram policies - Report #${reportIndex + 1}`
              }));
              
              totalReports++;
              console.log(`✅ Denúncia ${reportIndex + 1} enviada com sucesso por ${phone}`);
              
              // Delay entre denúncias do mesmo telefone
              if (reportIndex < reportsPerPhone - 1) {
                console.log(`⏳ Aguardando 10s antes da próxima denúncia...`);
                await new Promise(resolve => setTimeout(resolve, 10000));
              }
              
            } catch (reportError) {
              console.error(`❌ Erro na denúncia ${reportIndex + 1} de ${phone}:`, reportError.message);
              
              // Tenta com motivo diferente se falhar
              try {
                const reasonMap = {
                  'spam': new Api.InputReportReasonSpam(),
                  'violence': new Api.InputReportReasonViolence(),
                  'child_abuse': new Api.InputReportReasonChildAbuse(),
                  'pornography': new Api.InputReportReasonPornography(),
                  'copyright': new Api.InputReportReasonCopyright(),
                  'fake': new Api.InputReportReasonFake(),
                  'other': new Api.InputReportReasonOther()
                };
                
                await client.invoke(new Api.account.ReportPeer({
                  peer: botEntity,
                  reason: reasonMap[reportReason] || new Api.InputReportReasonSpam(),
                  message: `Spam bot - Report #${reportIndex + 1}`
                }));
                totalReports++;
                console.log(`✅ Denúncia alternativa ${reportIndex + 1} enviada por ${phone}`);
              } catch (fallbackError) {
                console.log(`⚠️ Falha na denúncia alternativa de ${phone}: ${fallbackError.message}`);
              }
            }
          }
          
          results.push({
            phone: phone,
            success: true,
            reportsSent: reportsPerPhone,
            message: `${reportsPerPhone} denúncias enviadas contra @${botUsername}`
          });
          
          await client.disconnect();
          
          // Delay entre telefones para evitar detecção
          if (phoneIndex < selectedPhones.length - 1) {
            console.log(`⏳ Aguardando ${delayBetweenReports}ms antes do próximo telefone...`);
            await new Promise(resolve => setTimeout(resolve, delayBetweenReports));
          }
          
        } catch (clientError) {
          console.error(`❌ Erro com cliente ${phone}:`, clientError.message);
          results.push({
            phone: phone,
            success: false,
            error: clientError.message
          });
          totalFailed++;
          
          try {
            await client.disconnect();
          } catch (err) {
            console.log('Erro ao desconectar:', err.message);
          }
        }
      }
      
      console.log(`✅ Campanha de denúncias concluída! Enviadas: ${totalReports}, Falhas: ${totalFailed}`);
      
      res.json({ 
        success: true,
        targetBot: `@${botUsername}`,
        summary: {
          totalProcessed: selectedPhones.length,
          successfulPhones: results.filter(r => r.success).length,
          failedPhones: totalFailed,
          totalReportsSent: totalReports,
          averageReportsPerPhone: totalReports / Math.max(results.filter(r => r.success).length, 1)
        },
        results: results
      });

    } catch (e) {
      console.error('❌ Erro mass-report-bot:', e);
      res.status(500).json({ 
        success: false,
        error: e.message || 'Erro interno no servidor'
      });
    }
  });
}
