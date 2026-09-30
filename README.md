# Almeida Advocacia Plataforma Administrativa

Sistema interno do escritório (Codó/MA): cadastro da equipe, cargos, **escalas de segunda a sábado**, **registro de ponto por PIN**, ocorrências/abonos, feriados e **folha de pagamento calculada por diária**.

Identidade visual extraída das logos: azul-marinho `#002060`, dourado `#D1B47D`, títulos em **Saira Stencil One** (o mais próximo do "ALMEIDA" da logo) e texto em **Jost** (geométrica, como "ADVOCACIA & CONSULTORIA").

## Como funciona o cálculo

```
diária          = salário mensal ÷ dias de trabalho previstos na escala no mês (seg–sáb, sem feriados)
bruto do período = diária × dias previstos no período (a partir da admissão)
desconto        = 1 diária por falta
líquido         = bruto − faltas − (atrasos, se ativado) + adicionais/horas extras − descontos/adiantamentos
```

* **Falta** = dia previsto na escala, já passado, sem nenhuma marcação de ponto aprovada e sem ocorrência remunerada.
* **Abonado** (atestado, declaração, audiência/diligência externa, férias, folga…) conta como dia pago. Ocorrência *não remunerada* vira falta.
* Feriados e recessos cadastrados saem do divisor da diária e não geram falta.
* Ajustes de ponto pedidos pelo funcionário (esqueceu de bater) só entram na conta **depois de aprovados** pela gerência.
* Períodos mensal ou quinzenal (Configurações → Folha). A folha de um período em andamento é uma **prévia**; só se fecha depois do último dia.
* Os valores são de **conferência gerencial**: INSS, IRRF, FGTS, férias e 13º **não** são calculados. Confirme com a contabilidade.

A regra está em `src/lib/folha.ts` (funções puras, com testes em `src/lib/folha.test.ts`).

## Perfis

| Perfil | Vê |
|---|---|
| **Funcionário** | Só a tela de ponto (`/`), com nome + PIN. Vê o próprio histórico. |
| **Gerência** | Presença, aprovações de ajuste de ponto, faltas a justificar, ocorrências, escalas, feriados, relatórios. **Não** vê salário nem folha. |
| **Administrador** | Tudo, incluindo funcionários, salários, folha, configurações e acessos. |

## Rodando

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # testes do motor de cálculo e do ponto
npm run build
```

Sem variáveis de ambiente o sistema roda em **modo demonstração**: dados fictícios salvos só no navegador (`localStorage`).
Login de demonstração: `admin@almeidaadvocacia.com.br` / `almeida2026` e `gerencia@almeidaadvocacia.com.br` / `gerencia2026`. PINs de ponto de exemplo: `1001` a `1008`.

## Usando o Supabase (banco real)

1. Use um projeto Supabase novo, só para este sistema (URL: `https://svasbxhxhvcranejwxku.supabase.co`).
2. Abra **SQL Editor**, cole e execute, nesta ordem, `supabase/migrations/0001_almeida_schema.sql`, `0002_gestao_usuarios.sql` e `0004_ajustes_manuais.sql` (tabelas, RLS, funções de ponto, cargos e escalas iniciais, gestão de acessos, diária fixa e ajuste de dias). Em bancos criados com a primeira versão do 0001, rode antes `0003_corrige_search_path.sql` (corrige o erro `function gen_salt(unknown) does not exist` ao salvar PIN: no Supabase o `pgcrypto` fica no schema `extensions`) ou use o arquivo único `supabase/atualizacao_definitiva.sql` (gerado por `supabase/gerar_atualizacao.sh`), que aplica 0003 + 0002 + 0004 + 0005 + 0006 + 0007 sem apagar dados e pode ser repetido.
3. Se ainda não houver administrador, em **Authentication → Users → Add user** crie o e-mail e a senha. Depois, no SQL Editor:
   ```sql
   insert into public.perfis (id, nome, email, papel)
   select id, 'Administrador', email, 'admin' from auth.users where email = 'SEU_EMAIL';
   ```
   Para a gerência, repita com `papel = 'gerente'`.
4. Copie `.env.example` para `.env.local` e preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (Project Settings → API → *anon public*). **Nunca** use a `service_role` no front-end.
5. Em **Authentication → Providers → Email**, desative o cadastro aberto (*Allow new users to sign up*), para que só o administrador crie acessos.

### Segurança

* PINs são guardados com `bcrypt` em tabela isolada (`funcionario_pins`), sem nenhuma política de leitura: só as funções `SECURITY DEFINER` acessam.
* O ponto é público, mas só por funções (`ponto_bater`, `ponto_historico`, `ponto_retroativo`) que exigem PIN e **bloqueiam por 10 min após 5 erros seguidos**.
* Gerência lê ponto/ocorrências por RLS e a equipe pela função `equipe()`, que omite salário, CPF e dados bancários.
* Teste do SQL: `supabase/run_rpc_tests.sh` sobe o schema num Postgres local (com um stub do schema `auth`) e exercita PIN, bloqueio, atraso, duplicidade, retroativo e permissões de `anon`/gerente/admin.

## Acessos ao painel

*Configurações → Acessos* (só administrador): criar usuário com e-mail e senha, escolher **Administrador master** ou **Gerência**, ativar/desativar, redefinir senha e remover. Sempre sobra pelo menos um administrador ativo, e ninguém remove o próprio acesso. No Supabase isso é feito pelas funções `criar_usuario`, `atualizar_usuario`, `redefinir_senha_usuario` e `remover_usuario` (`supabase/migrations/0002_gestao_usuarios.sql`), que só respondem a administradores.

## Produção

* **Dados da equipe não ficam no Git.** CPFs, PINs e o usuário master são criados por um SQL privado, executado uma única vez no SQL Editor do Supabase (schema + cadastro + acesso administrativo). Nunca versione esse arquivo.
* Com o Supabase ligado, a tela pública de ponto só mostra nomes depois que o funcionário digita as primeiras letras, e a marcação exige o PIN.
* Depois do primeiro login, troque a senha do administrador master e cadastre o e-mail real do responsável em *Configurações → Acessos*.

## Deploy (Vercel)

Importe o repositório, framework **Vite**, e configure as duas variáveis `VITE_SUPABASE_*`. O `vercel.json` já faz o redirecionamento de rotas (SPA).

## Referências usadas para estruturar o sistema

* **Jornada:** CLT (até 8h/dia e 44h/semana). Advogado empregado: art. 20 do Estatuto da OAB, alterado pela Lei 14.365/2022 — confira no contrato/convenção coletiva qual jornada se aplica; horas excedentes têm adicional mínimo de 100% pela lei, mas o percentual sugerido aqui é configurável.
* **Estágio:** Lei 11.788/2008 (até 6h/dia e 30h/semana no ensino superior) — a escala modelo "Estágio" respeita isso.
* **Salário mínimo 2026:** R$ 1.621,00 (Decreto 12.797/2025) — usado apenas como valor de exemplo para "Serviços Gerais".
* **Feriados:** nacionais fixos e móveis (Páscoa calculada), Adesão do Maranhão à Independência (28/07). **Feriados municipais de Codó não vêm cadastrados**: a fundação da cidade é 16/04/1896, mas confirme na legislação municipal se é feriado antes de lançar (a tela de Feriados traz essa sugestão).
* **Recesso forense** (20/12 a 20/01) suspende prazos processuais, mas não fecha o escritório automaticamente: cadastre em Feriados os dias sem expediente.

## Estrutura

```
src/lib        regras de negócio puras (folha, ponto, feriados, exportação)
src/data       camada de dados: local (demo) e supabase, mesma interface
src/pages      telas
supabase/      schema SQL + roteiro de teste das funções
```


## Edição manual e conferência da folha

- **Funcionários → editar**: salário, cargo, escala, dados de PIX/conta e *diária fixa* (opcional; substitui salário ÷ dias previstos).
- **Folha → Detalhes**: cada dia pode ser marcado como *Presente*, *Abonado* ou *Falta* (sobrepõe o ponto; "Automático" volta à apuração). Também é possível corrigir salário e diária, lançar/editar/remover ajustes (adicionais, horas extras, descontos) e reabrir folhas fechadas.
- **Registros de ponto**: lápis para corrigir o horário de uma marcação (com motivo, gravado na auditoria); administrador também pode excluir e lançar marcações.
- **Feriados**, **Escalas**, **Cargos** e **Ocorrências**: todos editáveis.
- **Exportações da folha** (PDF e Excel): funcionário, cargo, salário, diária, dias trabalhados/previstos, faltas, desconto de faltas, atrasos, adicionais, descontos, total a receber e PIX e/ou conta bancária. O demonstrativo individual também traz os dados de pagamento.

## Cerca de GPS (ponto só no escritório)

- O registro de ponto só é aceito a até **900 m** do escritório (Posto FC, Codó-MA: `-4.460791, -43.888099`).
- Ao abrir a tela de ponto o app pede a localização e mostra se o funcionário está **dentro** ou **fora** da área; fora dela os botões de marcação ficam bloqueados. A localização é lida de novo no momento do registro e a distância é recalculada **no servidor** (`ponto_bater`), então não basta mexer no navegador.
- **Configurações → Ponto**: ativar/desativar a cerca, endereço, latitude/longitude, raio, **Usar minha localização** (define o centro onde o administrador está e salva na hora, com confirmação e auditoria), **Testar minha distância** e **Ver no mapa**.
- Bancos existentes: rode `supabase/atualizacao_definitiva.sql` (inclui `0005_geofence.sql`; não sobrescreve uma localização já redefinida pelo sistema). Testes: `supabase/tests_geo.sql`.
- Limite técnico: o GPS vem do aparelho; uma pessoa técnica pode falsificar coordenadas em chamadas diretas à API. A cerca reduz fraudes comuns, e a auditoria e a aprovação de ajustes cobrem o resto.


## Segurança

- **Sem lista pública de funcionários.** A tela de ponto usa `ponto_buscar` (mín. 3 letras, máx. 5 resultados); `ponto_lista_ativos` foi revogada.
- **PIN forte.** 6 a 8 dígitos; sequências e repetições (123456, 111111…) são recusadas. PINs antigos de 4–5 dígitos continuam valendo até serem trocados; o painel avisa quais são.
- **Bloqueio por origem.** 5 erros da mesma origem (IP) para a mesma pessoa bloqueiam por 10 min; 15 erros da mesma origem em qualquer pessoa também; 25 erros de origens diferentes para uma pessoa também. Um colega não consegue travar o outro digitando errado de outro lugar.
- **Auditoria automática e imutável.** Gatilhos no banco registram quem mudou o quê (campo, valor antigo e novo) em funcionários, salários, marcações, folhas, ajustes, escalas, cargos, feriados, ocorrências, configurações e perfis. A tabela não aceita edição nem exclusão, nem de administrador. Configurações → Auditoria mostra o detalhe.
- **Senhas do painel:** mínimo de 10 caracteres com letras e números (medidor de força e gerador).
- **Cabeçalhos HTTP** (`vercel.json`): CSP restritiva, HSTS, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy` e `Permissions-Policy` (geolocalização só no próprio site).

## Design e acessibilidade

- Tokens de espaçamento, tipografia, elevação e movimento em `src/styles.css`; **tema claro/escuro/automático** e **densidade de tabelas** (compacta/confortável) no menu lateral, guardados no aparelho.
- Esqueletos de carregamento, estados vazios com ilustração e ação, ícones em três tamanhos, foco visível, link "Pular para o conteúdo", tabelas rolláveis por teclado, respeito a *reduzir movimento* (o carrossel da faixa lateral só troca sozinho se o aparelho permitir e pausa com mouse/foco).
- Tela de ponto: animação de sucesso, vibração, **modo quiosque** (tablet na recepção: relógio grande, botões grandes, reinício rápido) e retorno automático à tela inicial após a marcação.
- Conformidade WCAG 2.1 AA verificada com axe-core nas telas principais (claro, escuro, computador e celular).

## Documentos autênticos e impressão

- Todo PDF (folha, demonstrativo, frequência, espelho) recebe um **código e um QR Code** no rodapé. A página pública `/verificar/<código>` confirma tipo, período, totais e o hash, sem dados pessoais (`supabase/migrations/0007_documentos.sql`).
- Cada tela de tabela tem o botão **Imprimir** com layout próprio (cabeçalho do escritório, sem menus, sempre em tema claro).
