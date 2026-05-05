# Slay Tracker

Dashboard local para importar arquivos `.run` de Slay the Spire 2 e gerar analises sobre runs, mortes, progressao, tamanho de deck, win rate, pick rate e metricas customizadas.

## Como usar

Abra `index.html` no navegador e selecione os arquivos da pasta `history` do jogo. O app roda 100% no cliente e nao envia os dados para servidor.

Recursos incluidos:

- Upload multiplo de arquivos `.run` e `.json`
- Configuracoes de analise e modo claro/escuro
- Dashboard com widgets arrastaveis e expansivos
- Tabelas/graficos individuais
- Criador de graficos com variaveis importadas
- Persistencia local do ultimo dataset e layout em `localStorage`

## Dados testados

O parser foi preparado para o formato de historico de Slay the Spire 2 com `map_point_history`, `players`, `win`, `ascension`, `run_time`, `killed_by_encounter` e escolhas de cartas/reliquias/pocoes.
