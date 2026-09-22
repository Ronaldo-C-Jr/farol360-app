# FAROL360 — Como publicar (guia de referência)

Este é o código da fatia inicial: o site + a peça de servidor que conversa com o Claude.
A análise de **Empresa** já usa a IA de verdade. Login e banco entram na etapa seguinte.

## Arquivos
- `index.html` — a aplicação (login, catálogo, formulário, relatório, PDF).
- `api/analisar.js` — a peça de servidor que guarda a chave e chama o Claude.
- `package.json`, `vercel.json` — configuração.

## Publicação na Vercel (resumo — Ronaldo faz junto com o Claude, passo a passo)
1. Criar conta no **GitHub** e subir esta pasta como um repositório.
2. Criar conta na **Vercel** e importar esse repositório.
3. Em **Settings → Environment Variables**, criar:
   - Nome: `ANTHROPIC_API_KEY`
   - Valor: a chave `sk-ant-...` (colada só aqui, num campo secreto).
4. Clicar em **Deploy**. A Vercel devolve um endereço público (ex.: `farol360.vercel.app`).

## Importante
- A chave **nunca** vai no `index.html` nem em nenhum arquivo — só na variável de ambiente da Vercel.
- O plano gratuito da Vercel serve para testar. Para uso comercial com clientes pagantes, migrar depois para o plano pago (Pro).
- Modelos usados: `claude-sonnet-5` (padrão), `claude-opus-4-8` (pesado), `claude-haiku-4-5` (econômico).
