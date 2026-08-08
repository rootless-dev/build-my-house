# Build my House

Ferramenta web de modelagem 3D de construções, no espírito do SketchUp da época
do Google: você desenha no chão, empurra a face para cima e a casa aparece.
React + TypeScript + three.js, sem dependência de servidor.

**No ar:** <https://rootless-dev.github.io/build-my-house/>

```bash
npm install
npm run dev
```

## As três telas

1. **Carregamento** — não é enfeite: espera as fontes, testa se há WebGL (e diz
   qual placa respondeu), baixa o chunk do editor com o three.js, abre o banco
   local e lê a lista de projetos. Se alguma etapa falhar, ela para ali, explica
   o motivo e oferece tentar de novo.
2. **Menu** — a biblioteca de projetos: pontos de partida prontos, os recentes
   com miniatura, busca, ordenação, grade ou lista, renomear, duplicar e
   lixeira com restauração. Arrastar um `.casa` para a janela abre o arquivo.
3. **Editor** — a prancheta de sempre. O botão *Projetos* grava e volta ao menu.

## Onde os projetos ficam

No **IndexedDB da origem**, ou seja: no perfil do navegador, na máquina de quem
está usando — nada sobe para servidor nenhum. Foi escolhido no lugar do
`localStorage` por três motivos: guarda objetos estruturados e blobs (as
miniaturas são WebP renderizadas pelo próprio viewport), a cota é de centenas de
MB em vez de ~5 MB de texto, e a escrita não bloqueia a thread principal.

Na primeira execução o app pede `navigator.storage.persist()`. Concedido, o
navegador promete não descartar os dados quando o disco apertar — o rodapé do
menu mostra se a permissão saiu e quanto espaço está em uso.

O salvamento é automático: cada operação confirmada agenda uma gravação 1,5 s
depois, e sair da aba grava na hora. Ainda assim, `.casa` continua ali para quem
quiser uma cópia em disco de verdade — o único formato que sobrevive a limpar os
dados do navegador.

## Como funciona o modelo

O ponto central é que **faces não são armazenadas**. O modelo guarda só vértices
e arestas; as faces são recalculadas a cada mudança pelo arranjo planar
(`src/core/faces.ts`): para cada plano do modelo, as arestas coplanares são
projetadas em 2D e percorridas por meio-arcos até fechar os ciclos mínimos.

Isso é o que dá o comportamento que se espera de um modelador direto:

| O que você faz | O que acontece sozinho |
| --- | --- |
| Fecha um laço de linhas | A face aparece |
| Desenha um retângulo sobre uma face | A face se divide em duas |
| Desenha um retângulo dentro de outro | Vira furo na face de fora |
| Apaga uma aresta | As faces vizinhas se fundem |
| Cruza duas linhas | Ambas são quebradas no cruzamento |
| Empurra uma face até o outro lado | O vão fica vazado |

As normais são orientadas por casca fechada (volume com sinal), então o lado
"frente" (branco) fica por fora e o "verso" (azul) por dentro, como no SketchUp.

## Ferramentas

| Ferramenta | Atalho | O que faz |
| --- | --- | --- |
| Selecionar | `Espaço` | Clique seleciona; Shift alterna; duplo clique pega a face com as arestas |
| Linha | `L` | Cadeia de segmentos; fecha o laço para criar a face |
| Retângulo | `R` | Dois cantos; aceita `4;3` na caixa de medidas |
| Círculo | `C` | Centro e raio, 32 lados |
| Polígono | `G` | Número de lados no painel Ajustes |
| Arco | `A` | Corda em dois cliques, o terceiro puxa a flecha |
| Empurrar/Puxar | `P` | Dá volume à face; duplo clique repete a última distância |
| Deslocar | `F` | Offset do contorno da face — é assim que se faz espessura de parede |
| Mover | `M` | Move a seleção a partir de um ponto de referência |
| Girar | `Q` | Centro, referência, ângulo |
| Escala | `S` | Redimensiona a seleção; aceita `2`, `0,5` ou `150%` |
| Borracha | `E` | Arraste sobre arestas, guias e etiquetas; `Ctrl` suaviza em vez de apagar |
| Pintar | `B` | Aplica o material ativo; `Alt` copia o material da face |
| Trena e guias | `T` | Mede e deixa guias (veja abaixo) |
| Cota | `D` | Marca a medida no modelo, com linhas de chamada |
| Texto | `X` | Anotação com linha de chamada, presa a um ponto |
| Orbitar / Deslocar vista | `O` / `H` | Navegação dedicada |

## Anotações

O que fica marcado no desenho vive fora do grafo de arestas: não vira face,
não sai na exportação de malha, e some junto se você apagar.

**Cota (`D`)** — clique em dois pontos e afaste a linha de cota; ou clique
direto sobre uma aresta para cotá-la inteira de uma vez. O afastamento sempre
assenta num eixo, e as setas travam qual deles. A etiqueta mostra a medida real:
mova a geometria e ela se atualiza sozinha, porque a cota fica presa aos
vértices, não a coordenadas soltas.

**Texto (`X`)** — clique no que quer anotar e afaste a chamada. O texto já vem
preenchido com o que faz sentido para o alvo: área da face, comprimento da
aresta ou as coordenadas do ponto. Duplo clique na etiqueta reescreve.

**Trena e guias (`T`)** — como a fita métrica do SketchUp, mede *e* deixa
construção:

- a partir de uma **aresta**, arrastar cria uma linha-guia paralela;
- a partir de um **ponto**, o segundo clique deixa um ponto-guia;
- com `Ctrl`, só mede e não cria nada;
- digitar um valor coloca a guia na distância exata.

As guias entram na inferência (o cursor gruda nelas), aparecem tracejadas e
somem no botão “Apagar todas as guias”, no painel Ajustes.

Clicar numa etiqueta seleciona a anotação; com a borracha ativa, apaga.

## Navegação e precisão

- **Botão do meio** orbita, **Shift + meio** (ou botão direito) desloca a vista,
  **roda** dá zoom no ponto sob o cursor.
- A **inferência** gruda o cursor em extremidade, ponto médio, aresta, face e nos
  alinhamentos com os eixos vermelho/verde/azul. O marcador e a etiqueta ao lado
  do cursor dizem o que foi capturado.
- As **setas** travam no eixo X, Y ou Z. Aperte de novo para destravar.
- **Digite um número em qualquer lugar** e ele vai para a caixa de medidas, no
  canto inferior direito. Enter aplica o valor exato à operação em andamento:
  comprimento da linha, `largura;profundidade` do retângulo, raio, distância do
  push/pull, ângulo da rotação.
- `Ctrl Z` / `Ctrl Shift Z` desfaz e refaz. `Del` apaga a seleção. `Esc` cancela.

Unidades em metros, centímetros ou milímetros (painel Ajustes). A caixa de
medidas aceita sufixo próprio: `350cm` funciona mesmo com o projeto em metros.

## Roteiro de uma casa

1. Retângulo no chão: `R`, clique, digite `8;6`, Enter.
2. Levantar as paredes: `P`, clique na laje, digite `2.8`, Enter.
3. Espessura: `F` na face de cima, digite `0.2`, Enter.
4. Vazar o miolo: `P` na face interna, digite `-2.6`, Enter.
5. Janela: `R` na parede, `P` na abertura com `-0.2` — o vão atravessa.
6. Cotar: `D`, clique nos dois cantos da fachada, seta para travar o lado, clique.

## Publicar

O app é 100% estático — sem servidor, sem banco, tudo roda no navegador. Dá para
hospedar em GitHub Pages, Netlify, Vercel ou qualquer pasta servida por HTTP.

O build sai com caminhos **relativos** (`base: './'` no `vite.config.ts`), então
funciona tanto na raiz de um domínio quanto dentro de uma subpasta — que é o
caso do Pages de projeto, em `usuario.github.io/build-my-house/`.

Já está ligado. A cada merge na `main`, o workflow `deploy.yml` roda lint, build
e publica em <https://rootless-dev.github.io/build-my-house/>.

### Fluxo de trabalho

`main` e `develop` são protegidas: nenhuma das duas aceita push direto, force
push ou deleção — nem do dono do repositório. Toda mudança entra por pull
request com o check `verificar` (tipos, lint e build) verde.

```
feature/algo  →  PR  →  develop  →  PR  →  main  →  publica sozinho
```

Não é preciso aprovação de terceiros (o repositório é de uma pessoa só), mas a
CI precisa passar e a branch precisa estar atualizada com o destino.

Para conferir localmente como vai ficar numa subpasta:

```bash
npm run build
mkdir -p /tmp/pages/build-my-house && cp -R dist/. /tmp/pages/build-my-house/
cd /tmp/pages && python3 -m http.server 8099
# abra http://localhost:8099/build-my-house/
```

## Arquivos

- `.casa` — projeto completo (JSON), abre de volta com toda a geometria,
  materiais e faces apagadas. É o formato de troca e de backup; a biblioteca
  interna guarda o mesmo conteúdo no IndexedDB.
- `.obj` — malha triangulada com grupos por material, convertida para Y-up.
- `.stl` — malha para impressão 3D.

## Organização do código

```
src/
  core/       geometria pura, sem three.js nem React
    math.ts       vetores, planos, interseções
    faces.ts      arranjo planar: arestas → faces com furos
    model.ts      grafo, desenho, push/pull, offset, serialização
    tessellate.ts triangulação de face com furos
    units.ts      formatação e leitura de medidas
    io.ts         .casa (leve: o menu importa daqui sem puxar o three.js)
    mesh-export.ts .obj / .stl (triangula, logo depende do three.js)
    templates.ts  pontos de partida oferecidos no menu
    selftest.ts   verificação do núcleo (veja abaixo)
  storage/    biblioteca de projetos no IndexedDB
    idb.ts        envelope de promessas sobre a API crua
    library.ts    CRUD, lixeira, miniaturas, cota e persistência
    save.ts       ponte entre a store e a biblioteca
  boot/       etapas reais da tela de carregamento
  viewer/     three.js
    Viewport.ts     cena, luzes, entrada, etiquetas DOM, despacho de ferramentas
    CameraRig.ts    órbita Z-up estilo SketchUp
    ModelView.ts    modelo → malhas e arestas
    Inference.ts    motor de inferência/snap
    Overlay.ts      elásticos, guias e pré-visualizações
    annotations.ts  geometria de cotas, textos e guias
  tools/      uma classe por ferramenta
  state/      store zustand (o modelo é um singleton mutável fora do React)
  ui/         componentes React
    Root.tsx      as três fases: carregamento → menu → editor
    LoadingScreen.tsx / Home.tsx / App.tsx
    load.ts       fronteira do `import()` que separa o chunk do editor
  styles/     SCSS
```

O editor inteiro (com o three.js) fica atrás de um `import()` dinâmico, então a
primeira tela baixa só React + menu. É esse download que a etapa "Motor 3D" da
tela de carregamento está de fato esperando.

**Idioma:** todo o código é escrito em inglês — nomes, comentários, valores de
união e classes CSS. Só os textos que aparecem na tela são em português, porque
o produto é em português.

### Verificação do núcleo geométrico

Com o dev server rodando, no console do navegador:

```js
const { selftest } = await import('/src/core/selftest.ts');
console.table(selftest());
```

Cobre criação de face, caixa por push/pull, esticar em vez de duplicar, furo,
quebra em cruzamento, fusão ao apagar aresta, vão vazado, cota presa ao vértice
e ida-e-volta de arquivo (inclusive projetos da versão 1, sem anotações).

## Limites conhecidos

- Sem grupos e componentes: o modelo é uma malha única. Geometrias que se tocam
  se fundem, como no SketchUp sem agrupar.
- Sem operações booleanas de verdade. O "vazar" do push/pull é uma heurística:
  funciona quando a face de destino contém a extrusão.
- Sem texturas de imagem — materiais são cor, rugosidade e transparência.
- As faces são recalculadas por inteiro a cada edição. Confortável até alguns
  milhares de arestas.

### Da barra do SketchUp, ainda faltam

- **Seguir-me** (extrudar um perfil ao longo de um caminho) — é o que faz
  rodapé, cimalha e telhado curvo.
- **Plano de seção** — corte para ver o interior sem esconder paredes.
- **Transferidor** — guias em ângulo.
- **Posicionar câmera / Passear / Olhar ao redor** — vista em altura de olho.
- **Texto 3D** e **mão livre**.
- **Camadas/tags e cenas** — organizar e guardar pontos de vista.
