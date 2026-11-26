# CLP-ViewLab

Laboratório de simulações interativas da disciplina **Conceitos de Linguagens de Programação**, do curso de **Ciência da Computação** da **Universidade Federal de Pelotas**. Desenvolvido no **Semestre 2026/2**.

[Abrir o CLP-ViewLab no GitHub Pages](https://gersoncavalheiro.github.io/CLP-ViewLab/)

## Simulações

1. **Máquina de von Neumann.** Acompanhe a busca, a decodificação e a execução de um programa em uma CPU com memória única para instruções e dados. Altere os operandos e compare a execução sequencial com um pipeline didático de quatro estágios. Observe a leitura que aguarda uma escrita anterior no mesmo endereço e a disputa entre busca de instruções e acesso a dados pela porta da memória. [Abrir simulação](simulacoes/von-neumann/index.html)
2. **Instruções Atômicas.** Compare dois núcleos que incrementam o mesmo contador. Varie o intervalo entre eles para observar a perda de atualização com leitura, soma e escrita separadas. A visualização de hardware mostra como a coerência de cache transfere a linha e a permissão de escrita entre os núcleos que executam `LOCK XADD`. [Abrir simulação](simulacoes/atomicas/comparacao.html)
3. **Multiplicação de vetor por escalar.** Veja o mesmo laço em C representado em assembly escalar e em AVX. As duas versões calculam os mesmos 1.024 produtos. A versão AVX processa quatro elementos por iteração. Compare os registradores, o movimento dos dados e as contagens de instruções e iterações. [Abrir simulação](simulacoes/avx/index.html)

A ordem segue os temas da 11ª edição de *Conceitos de Linguagens de Programação*, de Robert W. Sebesta. [Sumário da Pearson](https://www.pearson.com/se/Nordics-Higher-Education/subject-catalogue/computer-science/sebesta-concepts-of-programming-languages-11e-ge.html?tab=instructor-resources)

## Executar localmente

Baixe ou clone o repositório e abra `index.html` em um navegador. As páginas usam HTML, CSS e JavaScript e funcionam diretamente a partir dos arquivos. Cada simulação fica em uma pasta própria em `simulacoes/`.

As linhas do tempo e as contagens representam os modelos didáticos de cada página. Use os controles para reproduzir a execução, inspecionar os estados intermediários e conferir os resultados.

## Inclusão de novas simulações

O guia do projeto descreve a estrutura de arquivos, a navegação e o critério para posicionar cada nova entrada na página inicial. [Guia do CLP-ViewLab](AGENTS.md)

## Professor

**Gerson Geraldo H. Cavalheiro**. [Homepage](https://wp.ufpel.edu.br/gersonc/) · [E-mail](mailto:gerson.cavalheiro@inf.ufpel.edu.br)
