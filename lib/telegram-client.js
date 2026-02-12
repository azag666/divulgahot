import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { supabase } from "./supabase";

const API_ID = parseInt(process.env.TELEGRAM_API_ID || '20455328');
const API_HASH = process.env.TELEGRAM_API_HASH || '6720790e72956790937a441369369363';

export const getClient = async (phone) => {
    const cleanPhone = String(phone).replace(/\D/g, '');

    // Busca a sessão no Supabase
    const { data, error } = await supabase
        .from('sessions')
        .select('session_string')
        .eq('phone_number', cleanPhone)
        .single();

    if (error || !data) {
        throw new Error(`Sessão não encontrada para ${cleanPhone}. Faça login novamente.`);
    }

    const client = new TelegramClient(
        new StringSession(data.session_string),
        API_ID,
        API_HASH,
        { connectionRetries: 5, useWSS: true }
    );

    await client.connect();
    return client;
};
