# Controle de Débitos — Documentação do Sistema

| Item | Valor |
|------|--------|
| Versão do sistema | 1.2.2 — Exportar omissões |
| Última atualização | 31/08/2026 (Confirmar no upload acha PDF no inbox mesmo com nome Agenci@Net) |
| Fonte oficial | Este arquivo |
| Guia rápido | `2. RELAÇÃO DE DEBITOS/COMO_RODAR.txt` |
| Deploy | `GIT.TXT` |

## 1. Como usar este documento

Mapa tela → regra → código. Antes de alterar comportamento, leia a ficha da tela e a regra correspondente.

## 2. Tecnologias utilizadas

| Camada | Tecnologia | Função |
|--------|------------|--------|
| UI | Next.js (App Router) em `2. RELAÇÃO DE DEBITOS/dashboard` | Painel e upload |
| API | Rotas Next (`/api/ingest`, `/api/delete-imported`) | Preview, commit, exclusão |
| Extração | Python (`scripts/ingest_upload.py`, `build_dashboard_data.py`) | Lê PDFs e gera `empresas.json` |
| Processo | PM2 `dashboard-debitos` no servidor Êxito | App em produção |

### 2.1 Histórico de versões

| Versão | Nome | O que mudou | Onde |
|--------|------|-------------|------|
| 1.2.2 | Exportar omissões | Confirmar acha o PDF no inbox com nome Agenci@Net (arroba, acento, espaços); destino `{codigo}-AGENCIANET.pdf` sem virar `1_159` | `/upload`, `dashboard/src/lib/inbox-file.ts`, `extrair_debitos.py` |
| 1.2.1 | Exportar omissões | Agenci@Net consulta: tributo/descrição até 120 chars (ex. ocupação área pública); bloco A VENCER só com tabela própria (Identificação + Código de Receita), sem inventar fantasma sobre grade clássica | `scripts/build_dashboard_data.py` (`parse_agencianet_consulta`) |
| 1.2.0 | Exportar omissões | Botão na home baixa Excel só com aba Detalhe (todas as omissões / competências) | `/` e `GET /api/omissoes/export` |
| 1.1.0 | Importar relatórios | PDF já na pasta (mesmo hash) pode ser confirmado: reindexa o painel, limpa o inbox, Agenci@Net = Estadual | `/upload` |
| 1.0.0 | Painel de débitos | Extração ECAC / Agenci@Net / Municipal e upload com preview | `/` e `/upload` |

## 3. Mapa de telas

| Origem | Ação | Destino |
|--------|------|---------|
| Home `/` | Exportar omissões | Download Excel (`omissoes_detalhe_….xlsx`) |
| Home `/` | Importar relatórios | `/upload` |
| `/upload` | Confirmar e gravar | Home da competência (`/?competencia=MM-YYYY`) |
| `/upload` | Voltar ao painel | Home |

## 5. Índice de rotas e onde olhar no código

| Tela | Rota | Código |
|------|------|--------|
| Painel | `/` | `dashboard/src/app/page.tsx` + `EmpresasTable.tsx` |
| Importar relatórios | `/upload` | `dashboard/src/components/UploadPanel.tsx` |
| API preview/commit | `POST /api/ingest` | `dashboard/src/app/api/ingest/route.ts` |
| Inbox do upload | Nome seguro + resolver lote | `dashboard/src/lib/inbox-file.ts` |
| API limpar inbox | `DELETE /api/ingest` | `dashboard/src/app/api/ingest/route.ts` |
| API excluir importado | `POST /api/delete-imported` | `dashboard/src/app/api/delete-imported/route.ts` |
| API exportar omissões | `GET /api/omissoes/export` | `dashboard/src/app/api/omissoes/export/route.ts` |
| Coleta omissões Excel | — | `dashboard/src/lib/omissoes-export.ts` |
| Ingestão/gravação | — | `scripts/ingest_upload.py` |
| Extração Agenci@Net | — | `scripts/build_dashboard_data.py` (`parse_agencianet_debitos`) |
| Classificação | — | `scripts/extrair_debitos.py` (`classify_text`) |

## 6. Telas e fluxos

### Painel (`/`)

| Seção | Campo / ação | Como funciona | Regra / bloqueio | Código |
|-------|----------------|----------------|------------------|--------|
| Cabeçalho | Exportar omissões | Baixa Excel com **só** a aba Detalhe | Lê `empresas.json`; todas as competências em `snapshots` | `EmpresasTable.tsx` + `/api/omissoes/export` |

Critério das linhas do Excel: `situacao = OMISSAO` ou `titulo` começa com `OMISSAO` (DCTFWEB, DCTF, ECF, DIRF, EFD, PGDAS, GFIP, etc.). Não inclui INAPTA nem irregularidade cadastral.

### Importar relatórios (`/upload`)

| Seção | Campo / ação | Como funciona | Regra / bloqueio | Código |
|-------|----------------|----------------|------------------|--------|
| Competência | MM-YYYY | Pasta do mês | Obrigatória | `UploadPanel.tsx` |
| Zonas | ECAC / Agenci@Net / Municipal | Arrastar ou escolher PDF | Só PDF | `UploadPanel.tsx` |
| Analisar | Preview dry-run | Extrai lançamentos no inbox | Extração inválida = erro | `ingest_upload.py` |
| Revisão | Checkbox Incluir | Marca o que vai ao painel | Precisa extração válida (débitos ou `SEM_PENDENCIA`) e arquivo no inbox | `hasRealExtract` |
| Duplicado | Badge | PDF já existe na pasta (mesmo hash) | **Não bloqueia.** Confirmar reindexa o painel | `apply_same_hash_skip` |
| Confirmar | Gravar | Resolve o inbox (`inbox_rel` relativo, nome com `@`/acento) e move ou reindexa | Arquivo some do inbox só depois de gravar; nome do site Agenci@Net não bloqueia | `inbox-file.ts` + `ingest_upload.py` |

### Fluxo

1. **Preview** — PDFs vão para `resultados/inbox_upload/MM-YYYY/{lote}/N_nome.pdf` (nome ASCII, sem `@`); Python extrai em dry-run.
2. **Revisão** — Usuário marca linhas com extração válida (débitos ou `SEM_PENDENCIA`). Badge Duplicado é informativo.
3. **Commit** — API resolve o arquivo no inbox (`inbox_rel` relativo ao lote, depois nome normalizado).
   - Arquivo novo: move para `pendencias/` (ou `sem_pendencias/`) como `{codigo}-AGENCIANET.pdf` (ex. `159-AGENCIANET.pdf`, não `1_159-…`).
   - Mesmo hash já na pasta: **não move de novo**; apaga a cópia do inbox; regenera o JSON com o parser atual.
4. Após commit ok, o inbox do lote é limpo (confirmados e desmarcados).

## 7. Regras de negócio

- Tipo `AGENCIANET` = esfera **Estadual** (não Federal).
- Layouts Agenci@Net: Certidão Negativa GDF, Consulta (Certidão Positiva), DAR/Lançamento Administrativo.
- Consulta (grade clássica): inscrição / ano / receita / tributo (descrição até **120** caracteres) / QPA opcional / valor BRL. Exemplos longos: “insc dat-ocupacao area publica propaganda”, “ocupacao area publica por meio de propaganda”.
- Bloco **A VENCER**: só quando o chunk tem cabeçalho próprio (`Identificação` + `Código de Receita`) e **não** tem grade clássica (`Valor Débito` / `Tributo`). Se a mesma inscrição+ano já veio da grade clássica com valor > 0, não cria linha A VENCER zerada.
- CND sem débitos: `SEM_PENDENCIA`, 0 linhas — importação permitida.
- Mesmo hash na pasta da empresa + commit: `ok`, não `duplicado` bloqueante; aviso `PDF já existia — painel reindexado`.
- Preview de mesmo hash: `duplicado: true` só para o badge; confirmação continua habilitada.
- Prefixo `{indice}_` do inbox (ex. `1_159-Agenci@Net - Certidão…`) vira código `159` e destino `159-AGENCIANET.pdf`.
- pymupdf é obrigatório (`scripts/requirements-debitos.txt`).
- Exportar omissões: Excel com uma aba Detalhe; todas as competências; só linhas `OMISSAO` / título `OMISSAO…`.

## 8. Como usar o sistema (guia do dia a dia)

### Exportar omissões (Excel)

1. Abra a home do painel (`/`).
2. Clique em **Exportar omissões**.
3. Abra o arquivo baixado (`omissoes_detalhe_AAAA-MM-DD.xlsx`).
4. Use o filtro da coluna **Título** ou **Competência** na aba Detalhe.

### Importar PDFs

1. Abra **Importar relatórios** (`/upload`).
2. Escolha a competência (ex.: 08-2026).
3. Solte os PDFs na zona correta (Agenci@Net = Estadual).
4. Clique **Analisar**.
5. Na revisão, deixe marcados os PDFs com extração ok — inclusive os com badge **Duplicado**.
6. Clique **Confirmar e gravar no painel**.
7. Abra o link da competência e confira a aba Estadual da empresa.

PDFs baixados do site com nome **Agenci@Net - Certidão Positiva…** podem ser analisados e confirmados assim. Se a revisão ficou aberta de um deploy antigo e aparecer “Arquivo temporário não encontrado no inbox”, clique **Cancelar revisão**, **Analisar** de novo e então **Confirmar**.

Não é necessário excluir o PDF antigo para reenviar o mesmo arquivo. Excluir só se o arquivo no disco estiver errado (nome corrompido, PDF de outra empresa).

## 10. Segurança

- Inbox só aceita caminhos dentro de `resultados/inbox_upload/{competencia}/`.
- Lock de arquivo impede duas ingestões ao mesmo tempo.
- Sem secrets neste documento.

## 11. Deploy / ambiente

Servidor Êxito: ver `GIT.TXT`.

1. Backup de `empresas.json` e `cadastro-consultas.json`
2. `git pull`
3. Devolver os JSON
4. `npm run build` em `2. RELAÇÃO DE DEBITOS/dashboard`
5. `pm2 restart dashboard-debitos`

## 12. Ao atualizar este documento

Atualizar capa (versão + data), §2.1, ficha da tela e §8 na mesma entrega em que o comportamento mudar.
