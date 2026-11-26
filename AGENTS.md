# CLP-ViewLab

O CLP-ViewLab reúne simulações interativas para a disciplina Conceitos de Linguagens de Programação, do curso de Ciência da Computação da Universidade Federal de Pelotas. Cada simulação deve partir de uma pergunta que o estudante consiga investigar ao executar ou comparar exemplos.

## Ordem didática

- Use a 11ª edição de *Conceitos de Linguagens de Programação*, de Robert W. Sebesta, como referência. Identifique o capítulo e a seção que melhor correspondem ao objetivo didático da simulação. [Edição brasileira da Bookman](https://loja.grupoa.com.br/conceitos-de-linguagens-de-programacao-ebook-p992648) · [Sumário detalhado da 11ª edição na Pearson](https://www.pearson.com/se/Nordics-Higher-Education/subject-catalogue/computer-science/sebesta-concepts-of-programming-languages-11e-ge.html?tab=instructor-resources)
- Ordene as entradas de `index.html` pelo número do capítulo e da seção de referência. Quando duas entradas corresponderem à mesma seção, apresente primeiro a que fornece os pré-requisitos da outra. Registre a associação neste mapa ao incorporar uma simulação.
- Para um exemplo que combina linguagem e hardware, classifique pelo conceito que o estudante investiga. Uma implementação específica pode ilustrar um conceito mais geral do sumário.

| Seção do Sebesta | Simulação | Motivo da posição |
| --- | --- | --- |
| 1.4.1 · Arquitetura de computadores | [Máquina de von Neumann](simulacoes/von-neumann/index.html) | Apresenta programa armazenado, busca e execução sequencial e comunicação entre instruções pela memória. O pipeline mostra como a sobreposição de estágios preserva a dependência entre a escrita e a leitura. |
| 13.2 · Introdução à concorrência no nível de subprograma | [Instruções Atômicas](simulacoes/atomicas/comparacao.html) | O caso inicial mostra dois fluxos atualizando um estado compartilhado e permite estudar o conflito e a necessidade de sincronização. |
| 13.10 · Concorrência no nível de sentença | [Multiplicação de vetor por escalar](simulacoes/avx/index.html) | A pergunta central é como explorar o paralelismo entre iterações independentes. O laço escalar usa as estruturas iterativas da seção 8.3 como pré-requisito. |

## Inclusão de uma simulação

1. Crie a página de entrada em `simulacoes/<tema>/` e mantenha os arquivos HTML, CSS e JavaScript do tema nessa pasta. Reuse o modelo de execução entre páginas do mesmo tema quando elas comparam variantes de uma operação.
2. Adicione em `index.html` uma entrada para o simulador, na posição indicada pelo mapa. Apresente o tema e a pergunta de estudo em português, com um único link para o cenário inicial. Use a navegação interna para alcançar as demais versões. Os pontos de entrada atuais são o caso de conflito no contador e a versão escalar do laço.
3. Inclua na simulação um link `CLP-ViewLab` de volta à página inicial. Use caminhos relativos para que o portal funcione tanto ao abrir os arquivos localmente quanto no subdiretório do GitHub Pages. Preserve o semestre da edição e os dados acadêmicos na home ao incluir novas entradas.
4. Mostre os elementos necessários para responder à pergunta, como código, estado da memória, registradores ou operações em trânsito. Indique quais valores mudaram e qual evento causou a mudança. Em uma animação, siga o padrão do projeto de reproduzir, pausar, regular a velocidade e avançar manualmente quando esses controles ajudam a observar o modelo.
5. Indique o nível de abstração relevante. Por exemplo, a ordem do programa determina os valores observáveis e as dependências que uma implementação deve preservar. Em uma linha do tempo concorrente, use faixas paralelas para mostrar sobreposição. Quando houver contadores, atualize cada um no evento que ele mede.
6. Confira a entrada na home, o link de volta e os caminhos de cada recurso. Execute o cenário inicial e pelo menos um caso que exercite a diferença ensinada, como uma atualização perdida ou uma mudança na contagem de instruções.
