# Controle de Débitos — Documentação do Sistema

Fonte oficial de comportamento do repositório.

## Upload de PDFs

| Tela | Rota | Código |
|------|------|--------|
| Importar relatórios | `/upload` | `dashboard/src/components/UploadPanel.tsx` |
| API preview/commit | `POST /api/ingest` | `dashboard/src/app/api/ingest/route.ts` |
| Ingestão/gravação | — | `scripts/ingest_upload.py` |
| Extração Agenci@Net | — | `scripts/build_dashboard_data.py` (`parse_agencianet_debitos`) |
| Classificação | — | `scripts/extrair_debitos.py` (`classify_text`) |

### Fluxo

1. **Preview** — PDFs vão para `resultados/inbox_upload/MM-YYYY/{lote}/N_nome.pdf`; Python extrai em dry-run.
2. **Revisão** — Usuário marca linhas com extração válida (débitos ou `SEM_PENDENCIA`).
3. **Commit** — API resolve o arquivo no inbox (`inbox_rel` ou busca por nome) e grava na pasta da competência.

### Agenci@Net (estadual)

- Tipo de upload: `AGENCIANET`
- Layouts: Certidão Negativa GDF, Consulta (Certidão Positiva), DAR/Lançamento Administrativo
- CND sem débitos: `SEM_PENDENCIA`, 0 linhas — importação permitida
- Dependência: `pymupdf` (`scripts/requirements-debitos.txt`)

### Deploy servidor

Ver `GIT.TXT`: `git pull`, `npm run build`, `pm2 restart dashboard-debitos`.

Guia rápido: `2. RELAÇÃO DE DEBITOS/COMO_RODAR.txt`
