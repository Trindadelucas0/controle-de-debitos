# Controle de Débitos — Documentação do Sistema

| Item | Valor |
|------|--------|
| Versão do sistema | 1.5.0 — Layout Êxito |
| Última atualização | 23/09/2026 (identidade visual Êxito: verde #006b2b, Inter, Material Symbols, sidebar clara) |
| Fonte oficial | Este arquivo |
| Guia rápido | `2. RELAÇÃO DE DEBITOS/COMO_RODAR.txt` |
| Deploy | `GIT.TXT` |
| Catálogo visual (wireframes + botões) | [WIREFRAMES-TELAS.md](WIREFRAMES-TELAS.md) |

## 1. Como usar este documento

Mapa tela → regra → código. Antes de alterar comportamento, leia a ficha da tela e a regra correspondente.

Para ver o desenho de cada tela e o que cada botão faz, use [WIREFRAMES-TELAS.md](WIREFRAMES-TELAS.md). Este arquivo continua sendo a fonte oficial de regras.

## 2. Tecnologias utilizadas

| Camada | Tecnologia | Função |
|--------|------------|--------|
| UI | Next.js (App Router) em `2. RELAÇÃO DE DEBITOS/dashboard` | Painel e upload |
| Design | Inter, Material Symbols Outlined, paleta Êxito (`globals.css`, `lib/exito-palette.ts`) | Identidade visual do hub |
| API | Rotas Next (`/api/ingest`, `/api/delete-imported`) | Preview, commit, exclusão |
| Extração | Python (`scripts/ingest_upload.py`, `build_dashboard_data.py`) | Lê PDFs e gera `empresas.json` |
| Processo | PM2 `dashboard-debitos` no servidor Êxito | App em produção |

### 2.1 Histórico de versões

| Versão | Nome | O que mudou | Onde |
|--------|------|-------------|------|
| 1.5.0 | Layout Êxito | Chrome claro (fundo `#f9f9ff`, verde `#006b2b`); Inter + Material Symbols; sidebar 288px com gaveta abaixo de 1024px; gráficos e PDFs na paleta Êxito | `globals.css`, `ShellFrame`, todas as telas |
| 1.4.1 | Diagnóstico fiscal ECAC | Teto de parcelas **240**; vários acordos no mesmo CNPJ (clonar linha; unicidade CNPJ + nº de parcelamento não vazio); seletor **Incluir pelo total** não esconde quem já está na grade | `/parcelamentos` |
| 1.4.0 | Diagnóstico fiscal ECAC | Todo ECAC *Informações de Apoio* grava CND/QSA/situação no documento (`cadastro`); aba Federal mostra o card acima da grade; CND/QSA Regular **não** viram lançamento nem entram no Excel | `/empresas/[slug]` aba Federal, `extrair_debitos.py` (`parse_ecac_apoio_certidao`) |
| 1.3.0 | Exportar débitos | Botão na home baixa Excel só com aba Detalhe (todos os débitos monetários / competências); exclui omissões, INAPTA e irregularidade cadastral | `/` e `GET /api/debitos/export` |
| 1.2.4 | Exportar omissões | **Confirmar bloqueado** se 0 lançamentos e o PDF não for CND/consulta limpa de verdade (`is_legitimate_sem_pendencia`); coluna **SEÇÕES** do preview usa `receita`/`situação`; débito **A VENCER** sem BRL mostra texto explicativo no detalhe; identidade da empresa = **CNPJ** (códigos 14/75/79 na mesma linha = mesma matriz) | `ingest_upload.py`, `extrair_debitos.py`, `format.ts`, `EmpresaDetail.tsx` |
| 1.2.3 | Exportar omissões | Confirmar e Excluir no servidor relê só a pasta da empresa (não o mês inteiro); overlay **Atualizando o painel (n/total)**; exclusão usa destino relativo `pendencias/EMPRESA/arquivo.pdf` | `/upload`, `build_dashboard_data.py` (`touch_relpaths`), `delete-destino.ts` |
| 1.2.2 | Exportar omissões | Confirmar acha o PDF no inbox com nome Agenci@Net (arroba, acento, espaços); destino `{codigo}-AGENCIANET.pdf` sem virar `1_159` | `/upload`, `dashboard/src/lib/inbox-file.ts`, `extrair_debitos.py` |
| 1.2.1 | Exportar omissões | Agenci@Net consulta: tributo/descrição até 120 chars (ex. ocupação área pública); bloco A VENCER só com tabela própria (Identificação + Código de Receita), sem inventar fantasma sobre grade clássica | `scripts/build_dashboard_data.py` (`parse_agencianet_consulta`) |
| 1.2.0 | Exportar omissões | Botão na home baixa Excel só com aba Detalhe (todas as omissões / competências) | `/` e `GET /api/omissoes/export` |
| 1.1.0 | Importar relatórios | PDF já na pasta (mesmo hash) pode ser confirmado: reindexa o painel, limpa o inbox, Agenci@Net = Estadual | `/upload` |
| 1.0.0 | Painel de débitos | Extração ECAC / Agenci@Net / Municipal e upload com preview | `/` e `/upload` |

## 3. Mapa de telas

| Origem | Ação | Destino |
|--------|------|---------|
| Home `/` | Menu Parcelamentos | `/parcelamentos` |
| `/parcelamentos` | Incluir pelo total / Nova empresa | Grade do mês (`porCompetencia[MM-YYYY][id]`) |
| Home `/` | Exportar omissões | Download Excel (`omissoes_detalhe_….xlsx`) |
| Home `/` | Exportar débitos | Download Excel (`debitos_detalhe_….xlsx`) |
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
| Destino da exclusão | Path relativo (nunca Windows absoluto) | `dashboard/src/lib/delete-destino.ts` |
| API limpar inbox | `DELETE /api/ingest` | `dashboard/src/app/api/ingest/route.ts` |
| API excluir importado | `POST /api/delete-imported` | `dashboard/src/app/api/delete-imported/route.ts` |
| API exportar omissões | `GET /api/omissoes/export` | `dashboard/src/app/api/omissoes/export/route.ts` |
| API exportar débitos | `GET /api/debitos/export` | `dashboard/src/app/api/debitos/export/route.ts` |
| Coleta omissões Excel | — | `dashboard/src/lib/omissoes-export.ts` |
| Coleta débitos Excel | — | `dashboard/src/lib/debitos-export.ts` |
| Ingestão/gravação | — | `scripts/ingest_upload.py` |
| Extração Agenci@Net | — | `scripts/build_dashboard_data.py` (`parse_agencianet_debitos`) |
| Rebuild do painel | Mês inteiro ou só pastas tocadas | `scripts/build_dashboard_data.py` (`rebuild_dashboard`, `touch_relpaths`) |
| Classificação / CND | — | `scripts/extrair_debitos.py` (`classify_text`, `is_legitimate_sem_pendencia`, `parse_ecac_apoio_certidao`) |
| Detalhe da empresa | `/empresas/[slug]` | `dashboard/src/components/EmpresaDetail.tsx` |
| Parcelamentos | `/parcelamentos` | `dashboard/src/components/ParcelamentosPanel.tsx` |
| API parcelamentos | `GET/POST/PATCH/DELETE /api/parcelamentos` | `dashboard/src/app/api/parcelamentos/route.ts` |
| Regras parcelamentos | — | `dashboard/src/lib/parcelamentos.ts`, `dashboard/src/lib/parcelamentos-utils.ts` |
| API exportar parcelamentos | `GET /api/parcelamentos/export` | `dashboard/src/app/api/parcelamentos/export/route.ts` |

## 6. Telas e fluxos

### Painel (`/`)

| Seção | Campo / ação | Como funciona | Regra / bloqueio | Código |
|-------|----------------|----------------|------------------|--------|
| Cabeçalho | Exportar omissões | Baixa Excel com **só** a aba Detalhe | Lê `empresas.json`; todas as competências em `snapshots` | `EmpresasTable.tsx` + `/api/omissoes/export` |
| Cabeçalho | Exportar débitos | Baixa Excel com **só** a aba Detalhe (débitos monetários) | Lê `empresas.json`; todas as competências; exclui omissões/INAPTA/irregularidade | `EmpresasTable.tsx` + `/api/debitos/export` |

Critério das linhas do Excel de omissões: `situacao = OMISSAO` ou `titulo` começa com `OMISSAO` (DCTFWEB, DCTF, ECF, DIRF, EFD, PGDAS, GFIP, etc.). Não inclui INAPTA nem irregularidade cadastral.

Critério das linhas do Excel de débitos: **inverso** — entra SIEF, SIDA, Agenci@Net, municipal, A VENCER, parcelamento etc.; **não** entra o que `isOmissaoDebito` classifica (omissão, INAPTA, irregularidade cadastral). Colunas monetárias em BRL para somar no Excel. CND/QSA do bloco Apoio **não** entram neste Excel.

### Detalhe da empresa (`/empresas/[slug]`)

| Seção | Campo / ação | Como funciona | Regra / bloqueio | Código |
|-------|----------------|----------------|------------------|--------|
| Federal | Diagnóstico fiscal | Card acima da grade (ou no lugar do vazio Regular): situação ATIVA/INAPTA/BAIXADA/NULA, responsável, certidão (tipo/número/emissão/validade), tabela de sócios | Só se o PDF ECAC tiver o bloco *Informações de Apoio*; `cadastro` omitido se vazio | `EmpresaDetail.tsx` + `parse_ecac_apoio_certidao` |
| Federal | Frase limpa | Texto da Receita (“não foram detectadas pendências…”) | Só quando `diagnosticoLimpo` (frase da Receita, não só PGFN, e sem sinal de pendência) | `Documento.cadastro.diagnosticoLimpo` |
| Federal | Lançamentos | Grade de débitos/omissões como antes | INAPTA e irregularidade cadastral continuam como lançamento; CND/QSA Regular não | `parse_ecac_debitos` |

### Importar relatórios (`/upload`)

| Seção | Campo / ação | Como funciona | Regra / bloqueio | Código |
|-------|----------------|----------------|------------------|--------|
| Competência | MM-YYYY | Pasta do mês | Obrigatória | `UploadPanel.tsx` |
| Zonas | ECAC / Agenci@Net / Municipal | Arrastar ou escolher PDF | Só PDF | `UploadPanel.tsx` |
| Analisar | Preview dry-run | Extrai lançamentos no inbox | **0 lançamentos** só confirma se for CND/consulta limpa (`is_legitimate_sem_pendencia`) ou se o bloco Apoio gerou `cadastro`; senão `REVISAR` e erro | `ingest_upload.py` |
| Revisão | Checkbox Incluir | Marca o que vai ao painel | Precisa extração válida (débitos, `SEM_PENDENCIA` legítimo ou `cadastro` ECAC) e arquivo no inbox | `hasRealExtract` |
| Revisão | Coluna SEÇÕES | Títulos das pendências | Agenci@Net usa `receita` ou `situação` quando não há `titulo` federal; ECAC com Apoio inclui **Certidão negativa/positiva/CPEN** e **QSA** mesmo com 0 lançamentos | `ingest_upload.py` → `titulos` |
| Duplicado | Badge | PDF já existe na pasta (mesmo hash) | **Não bloqueia.** Confirmar reindexa **só essa empresa** | `apply_same_hash_skip` |
| Confirmar | Gravar | Resolve o inbox, move ou reindexa, e atualiza **só a pasta da empresa** no JSON | Overlay passa de “Importando PDFs” para **Atualizando o painel (n/total)**; se o stream acabar sem `done`, avisa para atualizar a página | `inbox-file.ts` + `ingest_upload.py` + `touch_relpaths` |
| Overlay | Progresso | 100% do PDF não fecha a tela: falta o rebuild | Texto honesto da fase (analisar / gravar / atualizar painel) | `UploadPanel.tsx` + evento NDJSON `rebuild` |

### Fluxo

1. **Preview** — PDFs vão para `resultados/inbox_upload/MM-YYYY/{lote}/N_nome.pdf` (nome ASCII, sem `@`); Python extrai em dry-run.
2. **Revisão** — Usuário marca linhas com extração válida (débitos ou `SEM_PENDENCIA`). Badge Duplicado é informativo.
3. **Commit** — API resolve o arquivo no inbox (`inbox_rel` relativo ao lote, depois nome normalizado).
   - Arquivo novo: move para `pendencias/` (ou `sem_pendencias/`) como `{codigo}-AGENCIANET.pdf` (ex. `159-AGENCIANET.pdf`, não `1_159-…`).
   - Mesmo hash já na pasta: **não move de novo**; apaga a cópia do inbox; regenera o JSON **só da empresa tocada** (`touch_relpaths`). Rebuild do mês inteiro continua em `npm run data` (reaplica o parser calibrado em tudo).
4. Após commit ok, o inbox do lote é limpo (confirmados e desmarcados).

### Parcelamentos (`/parcelamentos`)

Menu **Parcelamentos**. Controle operacional mensal (não é a extração de PDF). Cada item do catálogo (`empresas[]`) é **um acordo**; o mesmo CNPJ pode ter várias linhas. A grade do mês é `porCompetencia[MM-YYYY][id]` — um slot por `id`, não por CNPJ.

| Seção | Campo / ação | Como funciona | Regra / bloqueio | Código |
|-------|----------------|----------------|------------------|--------|
| Competência | MM-YYYY (URL) | Mês aberto da grade | Precisa existir no JSON; senão **Gerar competência** | `page.tsx` + `ParcelamentosPanel.tsx` |
| Incluir pelo total | Empresa do cadastro | Lista **um item por CNPJ** (não some quem já está na grade) | Bloco visível se houver alguma empresa no catálogo | `empresasCatalogoUnicoCnpj` |
| Incluir pelo total | Total * / Parcela | PATCH com `novoAcordo: true`; se o `id` já tem linha no mês, **clona** o catálogo (nome, CNPJ, grupo, cód., site; nº vazio; id UUID) e grava no id novo | Total 1–240; parcela ≤ total; competência existente | `addParcelamentoNaGrade` + `PATCH /api/parcelamentos` |
| Nova empresa | Empresa *, CNPJ *, nº, site, cód., grupo, tipo, vencimento, total *, parcela | POST cria o acordo; PATCH monta o cronograma | CNPJ 14 dígitos; total 1–240; **não** bloqueia CNPJ repetido | `createEmpresa` |
| Grade | Situação | Ativo / Encerrado / Saiu / Erro na emissão / Cancelado | Cores de linha | `PARCELAMENTO_STATUS_*` |
| Grade | COD, Empresa, Site, Grupo, CNPJ | Identidade do acordo | Site: URL http(s) ou portal padrão do tipo (PGFN/e-CAC) | `EmpresaParcelamento` |
| Grade | Tipo | Municipal, Estadual, PGFN, SN, SN PERT, Outro | PGFN/SN/SN PERT preenchem vencimento (último dia útil) | `vencimentoAutomaticoPorTipo` |
| Grade | Nº parcelamento | Nº do acordo neste `id` | Unicidade **CNPJ + nº não vazio**; nº vazio pode repetir | `assertNumeroParcelamentoUnico` |
| Grade | Parcela atual / Total | Total informa o cronograma; parcela default 1 | Total **não pode passar de 240** (UI + servidor) | `MAX_TOTAL_PARCELAS`, `updateRegistro` |
| Grade | Em aberto / Último mês | Calculados | Encerrado/saiu/cancelado → em aberto 0 | `buildCardView` |
| Grade | Salvar linha | PATCH **sem** `novoAcordo` | Se o `id` já tem registro no mês, só edita — **não clona** | `saveCard` → `addParcelamentoNaGrade` |
| Grade | Remover da grade | DELETE com competência | Some só deste mês; catálogo permanece | `removeRegistroDaGrade` |
| Exportar | Excel / PDF | Baixa a grade do mês | — | `/api/parcelamentos/export`, `ParcelamentosPdfDocument.tsx` |

**Incluir segundo acordo da mesma empresa:** selecione de novo no **Incluir pelo total** (a empresa continua no seletor) → Total + Parcela → Incluir. Surge uma segunda linha. Salvar a linha antiga não duplica.

## 7. Regras de negócio

- Tipo `AGENCIANET` = esfera **Estadual** (não Federal).
- Layouts Agenci@Net: Certidão Negativa GDF, Consulta (Certidão Positiva), DAR/Lançamento Administrativo.
- Consulta (grade clássica): inscrição / ano / receita / tributo (descrição até **120** caracteres) / QPA opcional / valor BRL. Exemplos longos: “insc dat-ocupacao area publica propaganda”, “ocupacao area publica por meio de propaganda”.
- Bloco **A VENCER**: só quando o chunk tem cabeçalho próprio (`Identificação` + `Código de Receita`) e **não** tem grade clássica (`Valor Débito` / `Tributo`). Se a mesma inscrição+ano já veio da grade clássica com valor > 0, não cria linha A VENCER zerada. Na consulta Agenci@Net o valor BRL pode não existir — o painel mostra **A vencer (sem valor na consulta)**.
- CND sem débitos: `SEM_PENDENCIA`, 0 linhas — importação permitida **somente** se `is_legitimate_sem_pendencia` (CND GDF, consulta sem bloco “Consta(m)… débito(s)”, CND federal, ECAC “não foram detectadas pendências” sem sinais de Receita) **ou** se o bloco Apoio foi extraído (`cadastro`). PDF ilegível ou sem layout **não** grava como `sem_pendencias`.
- **ECAC Informações de Apoio:** CND (Negativa / Positiva / CPEN), QSA e situação cadastral (ATIVA/INAPTA/BAIXADA/NULA) vão em `documento.cadastro` de **todo** ECAC com esse bloco. **Não** são lançamento monetário e **não** entram no Excel de débitos. `CPF Representante Legal` / `Qualif. Resp.` não entram como sócio. INAPTA e irregularidade cadastral no diagnóstico fiscal **continuam** no parser de débitos.
- **Identidade da empresa = CNPJ** (14 dígitos). Vários códigos do escritório na mesma linha (ex. **14, 75, 79** da DT Tintas) = mesma matriz `/0001`, não filiais da Receita. Novo PDF com o mesmo CNPJ anexa na pasta existente (`match_empresa`). Filial federal (`/0002`, `/0003`) não entra nos totais se já houver ECAC da matriz na pasta.
- Mesmo hash na pasta da empresa + commit: `ok`, não `duplicado` bloqueante; aviso `PDF já existia — painel reindexado`.
- Preview de mesmo hash: `duplicado: true` só para o badge; confirmação continua habilitada.
- Prefixo `{indice}_` do inbox (ex. `1_159-Agenci@Net - Certidão…`) vira código `159` e destino `159-AGENCIANET.pdf`.
- Confirmar e Excluir no servidor reprocessam só `pendencias|sem_pendencias|revisar/EMPRESA` (`touch_relpaths`). Não relê as outras empresas do mês. Parsers calibrados (ECAC / Agenci@Net / municipal e auto-correção de zona) continuam valendo na pasta tocada.
- Destino da exclusão é sempre relativo (`pendencias/EMPRESA/arquivo.pdf`). Path absoluto desta máquina não vai ao servidor.
- Arquivo já ausente na exclusão: `ok` + rebuild incremental da pasta.
- pymupdf é obrigatório (`scripts/requirements-debitos.txt`).
- Exportar omissões: Excel com uma aba Detalhe; todas as competências; só linhas `OMISSAO` / título `OMISSAO…`.
- Exportar débitos: Excel com uma aba Detalhe; todas as competências; só lançamentos monetários (exclui omissão/INAPTA/irregularidade cadastral).
- **Parcelamentos — teto:** `totalParcelas` no máximo **240** (`MAX_TOTAL_PARCELAS`). Validado na UI (Incluir pelo total, Nova empresa, salvar linha) e no servidor (`normalizeRegistro` / `updateRegistro`).
- **Parcelamentos — vários acordos:** CNPJ pode repetir no catálogo. Cada `id` é um acordo. Unicidade: mesmo CNPJ + mesmo `numeroParcelamento` **não vazio** → erro `Já existe este nº de parcelamento para o CNPJ.` Nº vazio pode repetir (clones novos).
- **Parcelamentos — PATCH da grade:** `addParcelamentoNaGrade`. Se o `empresaId` já tem registro no mês e **não** veio `novoAcordo` → só `updateRegistro` (edição). Se **Incluir pelo total** (`novoAcordo`) e o id já tem linha → clona catálogo e grava no id novo. Se o id **não** tem registro e o CNPJ já tem outra linha (sem `novoAcordo`) → clona. Se o id não tem registro e o CNPJ não tem linha → `updateRegistro` no id original.

## 8. Como usar o sistema (guia do dia a dia)

### Exportar omissões (Excel)

1. Abra a home do painel (`/`).
2. Clique em **Exportar omissões**.
3. Abra o arquivo baixado (`omissoes_detalhe_AAAA-MM-DD.xlsx`).
4. Use o filtro da coluna **Título** ou **Competência** na aba Detalhe.

### Exportar débitos (Excel)

1. Abra a home do painel (`/`).
2. Clique em **Exportar débitos** (ao lado de Exportar omissões).
3. Abra o arquivo baixado (`debitos_detalhe_AAAA-MM-DD.xlsx`).
4. Use o filtro da coluna **Esfera**, **Competência** ou **Situação** na aba Detalhe.
5. Some valores nas colunas **Vl. original**, **Sdo. devedor**, **Multa**, **Juros** ou **Consolidado** (formato BRL).

### Importar PDFs

1. Abra **Importar relatórios** (`/upload`).
2. Escolha a competência (ex.: 08-2026).
3. Solte os PDFs na zona correta (Agenci@Net = Estadual).
4. Clique **Analisar**.
5. Na revisão: **LANÇ.** deve ser ≥ 1 (ou status **Sem pendência** só em CND/consulta limpa). Se aparecer aviso *conteúdo sem layout de débitos reconhecido* com **0 lançamentos**, **não confirme** — reexporte o PDF ou use a zona correta (Agenci@Net = Estadual).
6. Deixe marcados os PDFs com extração ok — inclusive os com badge **Duplicado**.
7. Clique **Confirmar e gravar no painel**. A tela mostra **Atualizando o painel (1/1)** só da empresa do lote — não fica em 100% relendo o mês.
8. Abra o link da competência e confira a aba **Estadual** (Agenci@Net) ou **Federal** (ECAC) da empresa.

### Diagnóstico fiscal (ECAC)

1. Importe o PDF ECAC em **Importar relatórios** (zona Federal) e confirme.
2. Abra a empresa na competência.
3. Na aba **Federal**, o card **Diagnóstico fiscal** mostra situação, responsável, certidão e sócios — inclusive quando não há lançamento (CND limpa).
4. A frase “não foram detectadas pendências…” só aparece quando a Receita (não só a PGFN) está limpa.
5. CND/QSA Regular não saem no **Exportar débitos**. INAPTA e omissões continuam na grade e no Excel de omissões.

**Agenci@Net 149 (A VENCER):** pode ter **1 lançamento** e saldo **R$ 0,00** — é normal; a SEFAZ não informa valor BRL nessa tela. No detalhe aparece *A vencer (sem valor na consulta)*.

**Copiar PDF na pasta do servidor** (`pendencias/…`) **não** atualiza o painel. Use **Importar relatórios** → Analisar → Confirmar, ou `npm run data` no servidor.

**Códigos múltiplos (ex. 14, 75, 79):** um CNPJ = uma linha no painel. São códigos internos do escritório para a mesma empresa, não filiais agrupadas pela matriz.

PDFs baixados do site com nome **Agenci@Net - Certidão Positiva…** podem ser analisados e confirmados assim. Se a revisão ficou aberta de um deploy antigo e aparecer “Arquivo temporário não encontrado no inbox”, clique **Cancelar revisão**, **Analisar** de novo e então **Confirmar**.

Badge **Duplicado**: o PDF já está na pasta. Confirmar reindexa a empresa (rápido). Não é necessário excluir o PDF antigo para reenviar o mesmo arquivo. Excluir só se o arquivo no disco estiver errado (nome corrompido, PDF de outra empresa).

Excluir no detalhe da empresa ou na revisão usa o mesmo rebuild curto. Se a exclusão “não termina”, atualize a página depois do deploy desta versão.

### Parcelamentos

1. Abra **Parcelamentos** no menu (`/parcelamentos`).
2. Confira a competência (MM-YYYY). Se o mês ainda não existir, use **Gerar competência**.
3. **Primeiro acordo:** em **Adicionar parcelamento**, escolha a empresa, informe **Total** (ex. 150) e **Parcela** (ex. 100) e clique **Incluir pelo total**. Até 240 parcelas.
4. **Segundo acordo da mesma empresa:** o seletor continua mostrando a empresa. Repita Total + Parcela → **Incluir pelo total**. Aparece uma **segunda linha** (nº de parcelamento vazio até você editar).
5. Preencha tipo, vencimento e nº na linha nova e **salve**. Salvar a linha antiga **não** cria outra linha.
6. Total **241** ou mais é recusado (mensagem na tela e no servidor).
7. **Nova empresa** cadastra um acordo novo (CNPJ pode ser o mesmo de outro acordo; o que não pode repetir é CNPJ + nº de parcelamento preenchido).
8. Exportar Excel/PDF baixa a grade do mês aberto.

## 10. Segurança

- Inbox só aceita caminhos dentro de `resultados/inbox_upload/{competencia}/`.
- Lock de arquivo impede duas ingestões ao mesmo tempo.
- Parcelamentos: teto 240 e unicidade CNPJ+nº validados **no servidor** (não só na UI).
- Sem secrets neste documento.

## 11. Deploy / ambiente

Servidor Êxito: `root@179.199.149.12`, repo `/root/PROJETOS/exito/controle-de-debitos`, PM2 `exito-debitos`, porta 6999. Ver `GIT.TXT` para script completo.

1. **Backup dos 3 JSON** em `/tmp/debitos-data-backup`:
   - `empresas.json` (débitos)
   - `cadastro-consultas.json` (consultas manuais)
   - `parcelamentos.json` (acordos operacionais)
2. `git pull --ff-only origin main`
3. **Devolver os 3 JSON** do backup e validar md5
4. `npm run build` em `2. RELAÇÃO DE DEBITOS/dashboard`
5. `pm2 restart exito-debitos`
6. **Nunca rodar `git clean -fd`** (apaga PDFs e inbox)

## 12. Ao atualizar este documento

Atualizar capa (versão + data), §2.1, ficha da tela e §8 na mesma entrega em que o comportamento mudar.
