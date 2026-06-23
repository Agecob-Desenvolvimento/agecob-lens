/**
 * Modo Demo — anonimização de PII para gravação/demonstração.
 *
 * Ativa com `?demo=1` na URL (persiste na sessão); desativa com `?demo=0`.
 * Quando ativo, TODA resposta da API passa por `demoAnonymize()` (chamado no
 * chokepoint `request()`), que troca agentes, devedores, carteiras, CPFs e
 * matrículas por valores fictícios ESTÁVEIS (mesmo original → mesmo fictício em
 * todas as telas). Os NÚMEROS são preservados — gráficos e totais seguem
 * consistentes. Sem efeito quando desativado (retorna o dado intacto).
 *
 * Distinção de chave: `NOME` (maiúsculo) = agente; `nome` (minúsculo) = carteira.
 */

let DEMO = false;
const SNAP_KEY = "agdash:demo:snap";
let snapshot: Record<string, unknown> = {};
try {
  if (typeof window !== "undefined") {
    const p = new URLSearchParams(window.location.search).get("demo");
    if (p === "1") window.sessionStorage.setItem("agdash:demo", "1");
    else if (p === "0") {
      window.sessionStorage.removeItem("agdash:demo");
      window.localStorage.removeItem(SNAP_KEY); // limpa o cache de demo
    }
    DEMO = window.sessionStorage.getItem("agdash:demo") === "1";
    if (DEMO) {
      const raw = window.localStorage.getItem(SNAP_KEY);
      if (raw) snapshot = JSON.parse(raw);
    }
  }
} catch {
  snapshot = {};
}

export function isDemoMode(): boolean {
  return DEMO;
}

/**
 * Cache de snapshot para o modo demo: a 1ª resposta (já anonimizada) é gravada
 * em localStorage; recarregamentos seguintes servem instantaneamente, sem rede.
 * Aquecer uma vez antes de gravar deixa o vídeo fluido.
 */
export function getDemoSnapshot(key: string): { hit: boolean; data: unknown } {
  if (!DEMO || !(key in snapshot)) return { hit: false, data: undefined };
  return { hit: true, data: snapshot[key] };
}

export function setDemoSnapshot(key: string, data: unknown): void {
  if (!DEMO) return;
  try {
    snapshot[key] = data;
    window.localStorage.setItem(SNAP_KEY, JSON.stringify(snapshot));
  } catch {
    /* quota excedida / indisponível — ignora (endpoint apenas refaz o fetch) */
  }
}

// Pools fictícios (não correspondem a pessoas/carteiras reais).
const PERSON_POOL = [
  "Ana Beatriz Costa", "Carlos Eduardo Lima", "Mariana Alves Pinto", "Rafael Souza Dias",
  "Juliana Ferreira Rocha", "Bruno Carvalho Melo", "Patrícia Gomes Nunes", "Felipe Araújo Tavares",
  "Camila Ribeiro Pires", "Gustavo Henrique Sá", "Larissa Moreira Cruz", "Diego Fonseca Brito",
  "Renata Cardoso Maia", "Thiago Barbosa Reis", "Aline Castro Lopes", "Vinícius Teixeira Ramos",
  "Fernanda Duarte Campos", "Leonardo Pacheco Vieira", "Bianca Azevedo Freitas", "Marcelo Nogueira Pena",
  "Tatiane Macedo Cunha", "André Luiz Bastos", "Priscila Antunes Goulart", "Rodrigo Vasconcelos Sá",
  "Letícia Monteiro Aguiar", "Eduardo Salgado Pinto", "Natália Queiroz Borges", "Henrique Camargo Dantas",
  "Sabrina Lacerda Pires", "Otávio Bittencourt Lima", "Carolina Siqueira Mota", "Igor Peixoto Farias",
  "Vanessa Coelho Brandão", "Lucas Andrade Furtado", "Débora Pimentel Rios", "Murilo Fagundes Couto",
  "Isabela Drummond Sales", "Caio Mendonça Vargas", "Adriana Bezerra Fontes", "Pedro Hugo Sampaio",
  "Gabriela Toledo Xavier", "Wesley Cordeiro Lima", "Simone Aragão Prado", "Daniel Espíndola Maia",
  "Raquel Bastos Viana", "Fábio Trindade Lemos", "Beatriz Galvão Pires", "Nelson Rangel Couto",
];
const PORTFOLIO_POOL = [
  "Carteira Aurora", "Carteira Horizonte", "Carteira Atlântico", "Carteira Bonança",
  "Carteira Meridiano", "Carteira Vértice", "Carteira Solstício", "Carteira Pináculo",
  "Carteira Boreal", "Carteira Zênite", "Carteira Cristal", "Carteira Âmbar",
  "Carteira Safira", "Carteira Turmalina", "Carteira Opala", "Carteira Citrino",
  "Carteira Quartzo", "Carteira Ônix", "Carteira Granada", "Carteira Topázio",
];

const personMap = new Map<string, string>();
const portfolioMap = new Map<string, string>();
const matriculaMap = new Map<string, string>();

function stableAssign(map: Map<string, string>, pool: string[], original: string, prefix: string): string {
  const existing = map.get(original);
  if (existing !== undefined) return existing;
  const i = map.size;
  const value = i < pool.length ? pool[i] : `${prefix} ${i + 1}`;
  map.set(original, value);
  return value;
}

function fakeMatricula(original: string): string {
  const existing = matriculaMap.get(original);
  if (existing !== undefined) return existing;
  const value = String(60000 + matriculaMap.size);
  matriculaMap.set(original, value);
  return value;
}

const loginMap = new Map<string, string>();

/** Login/chave fictícios no formato "Nome.Sobrenome" (estável por original). */
function fakeLogin(original: string): string {
  const existing = loginMap.get(original);
  if (existing !== undefined) return existing;
  const i = loginMap.size;
  const full = i < PERSON_POOL.length ? PERSON_POOL[i] : `Agente ${i + 1}`;
  const parts = full.split(" ");
  const value = parts.length >= 2 ? `${parts[0]}.${parts[parts.length - 1]}` : full;
  loginMap.set(original, value);
  return value;
}

// Matching case-insensitive por chave (lowercased), EXCETO o par NOME/nome:
// "NOME" (maiúsculo) = agente · "nome" (minúsculo) = carteira.
const PERSON_KEYS = new Set(["name", "agente", "nome_devedor", "nome_razao", "devedor"]);
const LOGIN_KEYS = new Set(["login", "agent_key", "chave"]);
const PORTFOLIO_KEYS = new Set(["portfolio", "portfolio_name", "escritorio", "grupo"]);
const MAT_KEYS = new Set(["matricula", "mat"]);
// Catch-all: valor no formato login "Nome.Sobrenome" (sem espaços).
const LOGIN_RE = /^\p{L}[\p{L}'’-]*\.\p{L}[\p{L}'’-]*$/u;

function deep(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(deep);
  if (node && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      const lk = k.toLowerCase();
      const str = typeof v === "string" ? v : null;
      if (lk.includes("cpf")) {
        out[k] = v == null ? v : "***.***.***-**";
      } else if (MAT_KEYS.has(lk)) {
        out[k] = v == null ? v : fakeMatricula(String(v));
      } else if (k === "nome" && str !== null) {
        out[k] = stableAssign(portfolioMap, PORTFOLIO_POOL, str, "Carteira");
      } else if ((k === "NOME" || PERSON_KEYS.has(lk)) && str !== null) {
        out[k] = stableAssign(personMap, PERSON_POOL, str, "Agente");
      } else if (LOGIN_KEYS.has(lk) && str !== null) {
        out[k] = fakeLogin(str);
      } else if (PORTFOLIO_KEYS.has(lk) && str !== null) {
        out[k] = stableAssign(portfolioMap, PORTFOLIO_POOL, str, "Carteira");
      } else if (str !== null && LOGIN_RE.test(str)) {
        out[k] = fakeLogin(str);
      } else {
        out[k] = deep(v);
      }
    }
    return out;
  }
  return node;
}

/** Anonimiza PII na resposta quando o modo demo está ativo; senão, no-op. */
export function demoAnonymize<T>(data: T): T {
  if (!DEMO) return data;
  return deep(data) as T;
}
