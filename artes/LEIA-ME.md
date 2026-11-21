# Artes do Leopardinho

Todas as artes do jogo, extraídas para PNG com fundo transparente.

No jogo, nada disso existe como imagem: tudo é desenhado por código (canvas) no `index.html`.
Estes PNGs foram gerados pelo script `ferramentas/extrair-artes.js`, que chama as próprias
funções de desenho do jogo, uma por uma. Para gerar de novo: `node ferramentas/extrair-artes.js`.

## O que tem em cada pasta

| Pasta | Conteúdo |
|---|---|
| `personagens/` | Os 17 leopardos. Cada um tem: parado, 8 quadros correndo, pulando (subindo/descendo), piscando, tropeçando e a bolinha rolando |
| `rivais/` | Os 6 bichos da Corrida (coelho, raposa, elefante, macaco, zebra, gatinho), com as mesmas poses |
| `acessorios/no_leo/` | O Leo usando cada acessório (laço, óculos, chapéu, capa, asas...) |
| `acessorios/so_o_acessorio/` | Só o acessório, já posicionado no lugar certo em cima do Leo |
| `frutas/` | Morango, morango dourado, laranja, banana, uva, melancia, cereja, abacaxi e a pedra que cai |
| `poderes/` | Ímã, estrela e nuvem de frutas (os itens que flutuam) |
| `obstaculos/` | Tronco, pedra, toco, cogumelo, castelo, boneco de neve, cupcake, cupinzeiro, caixa, pilha, barril, cerca, torre, galho, cristal, buraco, poça (+ versões com neve) |
| `ceu/` | Sol, lua, nuvens, nuvens de chuva, arco-íris |
| `bichinhos/` | Passarinhos (4 quadros de voo), gaivota, macaquinho, borboletas, vagalume, amiguinho, caranguejo, pinguim |
| `chegada/` | Linha de chegada e bandeiras de checkpoint |
| `interface/` | Corações de vida, estrelinha, moranguinho dourado do placar |
| `cenario/<fase>/camadas/` | O cenário de cada fase em 8 camadas, na tela inteira (céu, colinas/mar, árvores ao fundo, árvores, arbustos, chão, bichinhos do chão, folhas da frente) |
| `cenario/<fase>/elementos/` | Árvores e arbustos soltos, um por imagem |
| `folhas/` | Uma imagem por pasta mostrando tudo junto (bom para mandar de uma vez ao Gemini) |
| `referencia/` | Prints do jogo de verdade em cada fase (menu e jogando) |
| `manifest.json` | Tamanho e ponto de apoio de cada PNG (usado na hora de colocar as artes novas no jogo) |

## Como mandar para o Gemini (Nano Banana)

1. **Comece pelo Leo.** Mande `folhas/personagens__leo_leo.jpg` e uma captura de `referencia/`,
   e peça o estilo novo. Quando gostar do resultado, use essa imagem como referência de estilo
   em todos os outros pedidos, para tudo ficar com a mesma cara.
2. **Uma coisa de cada vez.** O Gemini se sai melhor com um PNG (ou uma folha pequena) por pedido.
3. **Animações:** mande os 8 quadros `correndo_01..08` juntos (ou a folha) e peça para manter
   exatamente as mesmas poses e a mesma ordem.

Sugestão de pedido (adapte):

> Redesenhe este personagem de jogo infantil mantendo exatamente a mesma pose, o mesmo
> enquadramento, a mesma proporção e o mesmo tamanho da imagem. Estilo: [descreva o estilo,
> ex.: ilustração infantil fofa, contornos suaves, sombreado leve, cores vibrantes].
> Não adicione cenário nem texto. Fundo de uma cor só, verde puro (#00FF00).

### Regras importantes para dar para colocar no jogo depois

- **Mesmo tamanho e mesma posição.** O desenho novo precisa ocupar o mesmo lugar dentro da imagem
  (os pés no mesmo ponto, a cabeça para o mesmo lado). Se o Gemini mudar o tamanho, tudo bem,
  desde que a proporção fique igual: a gente redimensiona.
- **Fundo:** o Gemini normalmente não devolve fundo transparente. Peça **fundo verde puro (#00FF00)**,
  que eu removo depois. Evite verde nos personagens para não confundir (a Folhinha é verde:
  para ela peça fundo **magenta #FF00FF**).
- **Mesmo nome de arquivo.** Salve a arte nova com o mesmo nome e na mesma pasta da original
  (ex.: `personagens/leo_leo/correndo_03.png`). Pode criar uma pasta `artes-novas/` com a mesma
  estrutura.
- **Leopardos de outras cores:** dá para redesenhar só o Leo e depois pedir as variações de cor
  usando as originais como guia.

## Depois: teste no jogo

Com as artes novas na mesma estrutura de pastas, o próximo passo é trocar, no `index.html`,
as funções de desenho (por exemplo `drawLeopard`, `drawFruit`, `drawObstacle`) por imagens,
usando o `manifest.json` para saber o tamanho e o ponto de apoio de cada uma. Dá para fazer
o teste aos poucos: primeiro só o Leo, depois frutas e obstáculos, depois o cenário.

O que **não** foi extraído porque são efeitos e não desenhos: partículas, chuva, neve caindo,
brilhos, sombras, textos e os emojis da interface (🧲 ⭐ 🏁 etc., que vêm do sistema do celular).
