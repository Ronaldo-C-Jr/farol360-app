// FAROL360 — Função de servidor (Vercel). Rota: POST /api/analisar
const MODELOS = {
  haiku:  { id: 'claude-haiku-4-5',  max: 4500 },
  sonnet: { id: 'claude-sonnet-5',   max: 5500 },
  opus:   { id: 'claude-opus-4-8',   max: 6000 },
};
const SYSTEM = `Você é o motor analítico do FAROL360, sistema de inteligência estratégica.
Produza análise rigorosa, consultiva e auditável, seguindo regras inegociáveis.

CLASSIFICAÇÃO DA EVIDÊNCIA — todo dado carrega sua natureza:
- OFICIAL: fonte oficial verificável.
- DERIVADO: calculado a partir de base oficial.
- ANALOGIA: inferido de casos/pares comparáveis.
- PROXY: sinal indireto (digital, notícia) — nunca medida direta.
- ESTIMATIVA/INFERÊNCIA: conclusão não observada.

REGRAS:
1. Todo número não observado é estimativa: marque o campo "est": true.
2. Nunca apresente proxy ou índice de imagem como intenção de voto nem como fato oficial.
3. Lacuna de dado é declarada — nunca preenchida com suposição decorativa.
4. Fonte enviada pelo cliente NÃO é oficial automaticamente: classifique-a.
5. Não invente fontes, números ou citações.
6. Tom consultivo: responda ao "e daí?", com implicações práticas.
7. Responda EXCLUSIVAMENTE com um objeto JSON válido no formato pedido. Sem texto fora do JSON. Seja conciso: frases curtas, no máximo 4 itens por lista.`;
function promptEmpresa(d) {
  const topicos = Array.isArray(d.topicos) ? d.topicos.join(', ') : (d.topicos || 'nenhum');
  return `Gere uma ANÁLISE ESTRATÉGICA DE EMPRESA.

DADOS:
- Empresa: ${d.empresa || '(não informado)'}
- Setor: ${d.setor || '(não informado)'}
- Cidade/sede: ${d.cidade || '(não informado)'}
- Período: ${d.periodo || 'últimos 3 anos'}
- Modo: ${d.modo || 'Completo'}
- Tópicos adicionais: ${topicos}
- Fontes próprias do cliente: ${d.fontes ? d.fontes : 'nenhuma'} (classificar; não tratar como oficiais)

REGRAS ESPECÍFICAS:
- NUNCA usar valores monetários. Só percentuais, índices ou números relativos.
- KPIs sempre em faixa (P5–P95).
- Explicar cada sigla no primeiro uso.
- Todo indicador gera recomendação prática.
- Incluir sempre o One Pager executivo.`;
}
const SCHEMA_EMPRESA = `FORMATO JSON OBRIGATÓRIO (preencha todos os campos; "est":true onde o valor for estimativa):
{
 "cabecalho":{"empresa":"","setor":"","cidade":"","periodo":"","modo":"","confiabilidade_0_100":0},
 "one_pager":{"indice_competitividade":{"valor":0,"est":true},
   "kpis_topo":[{"nome":"","faixa":"","est":true}],
   "cenario_base_12m":{"texto":"","est":true},"conclusao_consultiva":""},
 "pestel":[{"fator":"","leitura":"","implicacao":"","evidencia":"proxy"}],
 "competitivo":{"porter":"","vrio":"",
   "swot":{"forcas":[],"fraquezas":[],"oportunidades":[],"ameacas":[]}},
 "kpis":[{"nome":"","faixa_p5_p95":"","interpretacao":"","recomendacao":"","est":true}],
 "clientes_segmentos":[{"segmento":"","participacao":"","leitura":"","est":true}],
 "projecoes_12m":[{"cenario":"","receita_relativa":"","margem":"","leitura":"","est":true}],
 "roadmap":[{"horizonte":"","acao":""}],
 "confiabilidade":{"nota_0_100":0,"limitacoes":[],"fontes_cliente_consideradas":false}
}`;
function extrairJSON(txt) {
  let s = String(txt).trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/,'').trim();
  const i = s.indexOf('{'); const j = s.lastIndexOf('}');
  return (i >= 0 && j > i) ? s.slice(i, j + 1) : s;
}
export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ erro: 'Use POST.' }); return; }
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) { res.status(500).json({ erro: 'ANTHROPIC_API_KEY não configurada no servidor.' }); return; }
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const { promptId = 'empresa', dados = {}, modelo = 'sonnet' } = body;
    if (promptId !== 'empresa') { res.status(400).json({ erro: 'Nesta etapa só a análise de Empresa está ligada à IA.' }); return; }
    const m = MODELOS[modelo] || MODELOS.sonnet;
    const userPrompt = promptEmpresa(dados) + '\n\n' + SCHEMA_EMPRESA;
    const ac = new AbortController();
    const to = setTimeout(() => ac.abort(), 55000);
    let r;
    try {
      r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal: ac.signal,
        headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: m.id,
          max_tokens: m.max,
          system: SYSTEM,
          messages: [
            { role: 'user', content: userPrompt + '\n\nResponda APENAS com o objeto JSON, começando com { e terminando com }. Sem texto antes ou depois, sem cercas de código.' },
          ],
        }),
      });
    } catch (e) {
      clearTimeout(to);
      res.status(504).json({ erro: 'A IA demorou demais para responder. Tente de novo, ou use o modelo Haiku (mais rápido).' });
      return;
    }
    clearTimeout(to);
    if (!r.ok) {
      const t = await r.text();
      console.error('Anthropic HTTP', r.status, t);
      res.status(502).json({ erro: 'A IA recusou a chamada (HTTP ' + r.status + '): ' + t.slice(0, 400), detalhe: t.slice(0, 400) });
      return;
    }
    const j = await r.json();
    const texto = (j.content && j.content[0] && j.content[0].text) || '';
    let relatorio;
    try { relatorio = JSON.parse(extrairJSON(texto)); }
    catch (e) {
      const sr = j.stop_reason || '?';
      res.status(502).json({ erro: 'A IA não devolveu JSON válido (stop_reason=' + sr + '). Início: ' + texto.slice(0, 160) + ' […] Fim: ' + texto.slice(-160), bruto: texto.slice(0, 1200) });
      return;
    }
    res.status(200).json({ ok: true, relatorio, uso: j.usage || null, modelo: m.id });
  } catch (e) {
    res.status(500).json({ erro: 'Falha interna do servidor.', detalhe: String(e).slice(0, 300) });
  }
}