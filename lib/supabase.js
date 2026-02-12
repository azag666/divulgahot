import { createClient } from '@supabase/supabase-js';

// Tenta pegar as variáveis com prefixo NEXT_PUBLIC ou sem
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

// Log para ajudar a debugar na Vercel (aparecerá nos Logs da função)
if (!supabaseUrl || !supabaseKey) {
    console.error("❌ ERRO CRÍTICO: Variáveis do Supabase não encontradas!");
    console.error("URL:", supabaseUrl ? "Definida" : "Faltando");
    console.error("KEY:", supabaseKey ? "Definida" : "Faltando");
}

// Cria o cliente. Se faltar variável, não crasha o build, mas as chamadas falharão.
export const supabase = (supabaseUrl && supabaseKey) 
    ? createClient(supabaseUrl, supabaseKey)
    : null;
