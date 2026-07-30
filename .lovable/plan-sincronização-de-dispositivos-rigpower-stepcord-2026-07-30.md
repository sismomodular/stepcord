# Sincronização de dispositivos RigPower → Stepcord

O RigPower é a fonte de verdade. O Stepcord mantém uma cópia local (cache) só-leitura, alimentada por uma função de sincronização, e usa essa cópia no seletor de dispositivos e na auto-configuração de tensão/corrente do PicoPD.

Estado atual verificado: a base de dados do Stepcord está vazia (nenhuma tabela em `public`). Os dispositivos vivem hoje em ficheiros estáticos (`src/data/devices.ts`, `src/data/devicePower.ts`). Não há nada a renomear — a tabela `devices` é criada de raiz e coexiste com o catálogo estático.

## 1. Tabela `devices` (cache local)

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid PK | gerado localmente |
| source_id | text UNIQUE NOT NULL | id do dispositivo no RigPower (chave de dedupe) |
| name | text NOT NULL | |
| manufacturer | text | |
| voltage | numeric | V DC |
| current | numeric | A |
| polarity | text | ex.: `center-positive` / `center-negative` |
| power | numeric | W (se o RigPower fornecer) |
| connector | text | |
| connector_type | text | |
| observations | text | |
| last_synced_at | timestamptz NOT NULL | |
| created_at / updated_at | timestamptz | trigger de updated_at |

Acesso: leitura pública (a app precisa de ler sem login), escrita apenas pela função de sincronização (service role). Sem políticas de insert/update/delete para utilizadores.

Tabela auxiliar `sync_state` (uma linha por job) para guardar: `job`, `last_run_at`, `status`, `rows_synced`, `error`. É daqui que a UI lê a "última sincronização", mesmo quando a sincronização corre por cron.

## 2. Edge Function `sync-rigpower-devices`

- Pública quanto a rede, mas protegida por um segredo partilhado no header (`x-sync-secret`) para evitar que qualquer pessoa dispare sincronizações.
- Lê os secrets: `RIGPOWER_SUPABASE_URL`, `RIGPOWER_ANON_KEY`, `RIGPOWER_DEVICES_TABLE` (default `devices`), `SYNC_TRIGGER_SECRET`.
- Faz `GET {RIGPOWER_SUPABASE_URL}/rest/v1/{tabela}?select=*` com `apikey` + `Authorization: Bearer` da anon key só-leitura, com paginação por `Range` (1000 em 1000).
- Mapeia os campos do RigPower para o schema acima (mapeamento tolerante: aceita variações comuns de nomes de coluna e ignora campos desconhecidos).
- `upsert` em `devices` com `onConflict: source_id`, definindo `last_synced_at = now()`.
- Escreve o resultado em `sync_state` e devolve `{ ok, rows, last_synced_at, error? }`.
- Erros de configuração em falta devolvem 400 com mensagem clara ("RIGPOWER_SUPABASE_URL não configurado"), para o botão poder mostrar o motivo.

## 3. UI — página de definições

Novo cartão "Device sync (RigPower)" em `src/pages/Settings.tsx`:
- Mostra data/hora da última sincronização, nº de dispositivos em cache e estado do último run.
- Botão "Sincronizar agora" → invoca a função, com estado de loading e toast de sucesso/erro.
- Se os secrets não estiverem configurados, mostra aviso a indicar o que falta.

## 4. Seletor de dispositivos

`DeviceProfileSelector` passa a listar os dispositivos sincronizados (pesquisa por nome e fabricante, como no RigPower), mantendo os perfis locais do firmware como secção separada. Selecionar um dispositivo sincronizado alimenta a lógica já existente de auto-config (tensão/corrente/polaridade e o aviso de polaridade center-negative). Se a cache estiver vazia, o comportamento atual mantém-se inalterado.

## 5. Cron diário

Ativar `pg_cron` + `pg_net` e agendar a função uma vez por dia (03:00 UTC), passando o header do segredo. Fica configurado depois de a função estar publicada.

## O que preciso que configures do lado do RigPower

1. **URL do projeto Supabase do RigPower** (ex.: `https://xxxx.supabase.co`).
2. **Anon key** desse projeto.
3. **Nome da tabela/vista** de dispositivos e a lista de colunas (para eu confirmar o mapeamento).
4. No RigPower: política RLS de leitura pública (SELECT para `anon`) + `GRANT SELECT` na tabela. Não implemento essa parte — o endpoint fica configurável e a sincronização falha com mensagem clara até isto estar feito.

Quando aprovares, peço-te os secrets para adicionares em Project Settings → Secrets antes de a sincronização funcionar.
