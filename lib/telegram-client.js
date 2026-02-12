import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import fs from 'fs';
import path from 'path';

// Tenta pegar do .env ou usa valores padrão (substitua pelos seus se necessário)
const API_ID = parseInt(process.env.TELEGRAM_API_ID || '20455328'); 
const API_HASH = process.env.TELEGRAM_API_HASH || '6720790e72956790937a441369369363';

export const getClient = async (phone) => {
    let sessionString = null;

    // LÓGICA DE RECUPERAÇÃO DE SESSÃO
    // 1. Tenta ler de um arquivo sessions.json na raiz (comum em setups locais)
    try {
        const dbPath = path.join(process.cwd(), 'sessions.json');
        if (fs.existsSync(dbPath)) {
            const fileContent = fs.readFileSync(dbPath, 'utf-8');
            const sessions = JSON.parse(fileContent);
            // Procura a sessão pelo número (limpa formatação se precisar)
            const cleanPhone = phone.replace(/\D/g, '');
            const sessionObj = sessions.find(s => s.phone_number.replace(/\D/g, '') === cleanPhone);
            if (sessionObj) sessionString = sessionObj.session_string;
        }
    } catch (e) {
        console.warn("Aviso: Não foi possível ler sessions.json local", e.message);
    }

    // 2. Fallback: Se você usa banco de dados, adicione a lógica aqui.
    // Exemplo: const session = await db.collection('sessions').findOne({ phone });

    if (!sessionString) {
        throw new Error(`Sessão não encontrada para o número: ${phone}. Faça login novamente.`);
    }

    const client = new TelegramClient(
        new StringSession(sessionString),
        API_ID,
        API_HASH,
        { connectionRetries: 5, useWSS: true } // useWSS ajuda na Vercel
    );

    // Conecta sem pedir input do usuário (já deve estar logado)
    await client.connect();
    return client;
};
