# PASSO A PASSO - CONFIGURAR SUPABASE

## 1️⃣ ABRIR SUPABASE DASHBOARD
1. Acesse: https://supabase.com/dashboard
2. Selecione seu projeto
3. Vá para: "SQL Editor" (no menu lateral)

## 2️⃣ EXECUTAR SQL
Copie e cole todo o conteúdo abaixo no SQL Editor e clique em "RUN":

```sql
CREATE TABLE IF NOT EXISTS public.channels (
  id BIGSERIAL PRIMARY KEY,
  channel_id TEXT NOT NULL,
  channel_access_hash TEXT DEFAULT '',
  channel_name TEXT NOT NULL,
  channel_description TEXT DEFAULT '',
  creator_phone TEXT NOT NULL,
  selected_phones TEXT[] DEFAULT '{}',
  total_members INTEGER DEFAULT 1,
  status TEXT DEFAULT 'created',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_broadcast TIMESTAMP WITH TIME ZONE,
  created_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_channels_created_by ON public.channels(created_by);
CREATE INDEX IF NOT EXISTS idx_channels_status ON public.channels(status);
CREATE INDEX IF NOT EXISTS idx_channels_created_at ON public.channels(created_at);
CREATE INDEX IF NOT EXISTS idx_channels_creator_phone ON public.channels(creator_phone);

CREATE TABLE IF NOT EXISTS public.leads (
  id BIGSERIAL PRIMARY KEY,
  phone TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  assigned_to_channel TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leads_assigned_to_channel ON public.leads(assigned_to_channel);
CREATE INDEX IF NOT EXISTS idx_leads_phone ON public.leads(phone);
```

## 3️⃣ VERIFICAR CRIAÇÃO
Após executar, você deve ver:
✅ "Query executed successfully"
📋 Tabelas visíveis em "Table Editor"

## 4️⃣ TESTAR SISTEMA
1. Recarregue a página do admin
2. Vá para aba "📺 CANAIS"
3. Clique em "✅ SELECIONAR TODOS ONLINE"
4. Configure um canal e teste

## ⚠️ IMPORTANTE
- Execute o SQL APENAS uma vez
- Se der erro, verifique se já existe
- Após criar tabelas, o sistema funcionará 100%

## 🚀 RESULTADO ESPERADO
Após executar o SQL:
✅ Sistema de criação massiva funcionando
✅ Leads com @username sendo usados
✅ Canais sendo salvos no banco
✅ Broadcast massivo disponível

---

# SQL ALTERNATIVO (se o acima falhar)

Se o SQL acima der erro, tente este mais simples:

```sql
CREATE TABLE IF NOT EXISTS public.channels (
  id BIGSERIAL PRIMARY KEY,
  channel_id TEXT NOT NULL,
  channel_name TEXT NOT NULL,
  channel_description TEXT DEFAULT '',
  creator_phone TEXT NOT NULL,
  total_members INTEGER DEFAULT 1,
  status TEXT DEFAULT 'created',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.leads (
  id BIGSERIAL PRIMARY KEY,
  phone TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  assigned_to_channel TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```
